# TypeGPU ExecutionCtx Implementation Plan

## Overview

This document outlines a focused plan to enable slots, derived values, and privateVars to work on the CPU by creating a lightweight ExecutionCtx abstraction. The key insight is that ResolutionCtx is an implementation detail - we just need to track slot values in CPU mode.

## Current State

**The Problem**: Variables and some slot operations throw errors in COMPTIME mode because they expect a ResolutionCtx (WGSL mode only).

**The Execution Model**: TypeGPU actually has three execution modes:
- **WGSL Mode**: Code generation for GPU shaders (current ResolutionCtx)
- **COMPTIME Mode**: Resolution-time computation for derived values and preprocessing
- **JS Mode**: Runtime JavaScript execution for dual implementations

**The Solution**: Extend the execution model to properly support COMPTIME mode with variable access, while keeping ResolutionCtx unchanged for WGSL mode.

## Implementation Plan (1 Week)

### Day 1-2: Core ExecutionCtx Infrastructure

#### Create ExecutionCtx Interface
**File**: `src/executionCtx.ts`

```typescript
interface ExecutionCtx {
  readSlot<T>(slot: TgpuSlot<T>): T | undefined;
  withSlots<T>(pairs: SlotValuePair[], callback: () => T): T;
  unwrap<T>(eventual: Eventual<T>): T;
  
  // Variable support for COMPTIME mode
  readVariable<T>(variable: TgpuVar<any, T>): T;
  writeVariable<T>(variable: TgpuVar<any, T>, value: T): void;
}

class ComptimeExecutionCtx implements ExecutionCtx {
  private slotValues = new WeakMap<TgpuSlot<any>, any>();
  private variables = new WeakMap<TgpuVar<any, any>, any>();
  
  // Simple implementations that mirror ResolutionCtx slot logic
  // This runs during shader preprocessing, not GPU simulation
}
```

#### Extend Runtime Mode System
**File**: `src/gpuMode.ts`

```typescript
const WGSLMode = Symbol('WGSL');
const ComptimeMode = Symbol('COMPTIME'); 
const JSMode = Symbol('JS');

export const RuntimeMode = {
  WGSL: WGSLMode,      // GPU shader generation (was GPU)
  COMPTIME: ComptimeMode, // Resolution-time computation (new)
  JS: JSMode,          // Runtime JavaScript (was CPU)
} as const;

// Add COMPTIME execution context alongside existing ResolutionCtx
let comptimeExecutionCtx: ExecutionCtx | null = null;

export function getExecutionCtx(): ExecutionCtx | null {
  const currentMode = getCurrentMode();
  if (currentMode === RuntimeMode.WGSL) {
    return getResolutionCtx();
  } else if (currentMode === RuntimeMode.COMPTIME) {
    return comptimeExecutionCtx;
  }
  return null; // JS mode doesn't need execution context
}

export function provideComptimeCtx<T>(ctx: ExecutionCtx, callback: () => T): T {
  const prev = comptimeExecutionCtx;
  comptimeExecutionCtx = ctx;
  try {
    return callback();
  } finally {
    comptimeExecutionCtx = prev;
  }
}

export const inWGSLMode = () => getCurrentMode() === RuntimeMode.WGSL;
export const inComptimeMode = () => getCurrentMode() === RuntimeMode.COMPTIME;
export const inJSMode = () => getCurrentMode() === RuntimeMode.JS;
```

### Day 3: Variable System Updates

#### Remove COMPTIME Mode Restrictions
**File**: `src/core/variable/tgpuVariable.ts`

```typescript
// Change this:
get value(): Infer<TDataType> {
  if (!inGPUMode()) {
    throw new Error('`tgpu.var` values are only accessible on the GPU');
  }
  return this[$gpuValueOf]();
}

// To this:
get value(): Infer<TDataType> {
  const ctx = getExecutionCtx();
  if (!ctx) {
    throw new Error('Cannot access variable outside execution context');
  }
  
  if (inWGSLMode()) {
    return this[$gpuValueOf]();
  } else if (inComptimeMode()) {
    return ctx.readVariable(this);
  } else {
    throw new Error('Variables not accessible in JS mode');
  }
}
```

#### Add Variable Assignment Support
```typescript
set value(newValue: Infer<TDataType>) {
  const ctx = getExecutionCtx();
  if (!ctx) {
    throw new Error('Cannot assign variable outside execution context');
  }
  
  if (inWGSLMode()) {
    throw new Error('Cannot assign to variables in WGSL mode');
  } else if (inComptimeMode()) {
    ctx.writeVariable(this, newValue);
  } else {
    throw new Error('Variables not accessible in JS mode');
  }
}
```

### Day 4: Slot System Integration

#### Update Slot Implementation
**File**: `src/core/slot/slot.ts`

```typescript
[$gpuValueOf](ctx: ResolutionCtx | ExecutionCtx): InferGPU<T> {
  return getGpuValueRecursively(ctx, ctx.unwrap(this));
}

get value(): InferGPU<T> {
  const ctx = getExecutionCtx();
  if (!ctx) {
    throw new Error(`Cannot access tgpu.slot's value outside of execution context.`);
  }
  
  return this[$gpuValueOf](ctx);
}
```

#### Update Derived Values
**File**: `src/core/slot/derived.ts`

```typescript
get value(): InferGPU<T> {
  const ctx = getExecutionCtx();
  if (!ctx) {
    throw new Error(`Cannot access tgpu.derived's value outside of execution context.`);
  }
  
  return this[$gpuValueOf](ctx);
}
```

### Day 5: Function Integration & Testing

#### Update Derived Value Computation
**File**: `src/resolutionCtx.ts`

Update derived computation to run in COMPTIME mode:

```typescript
_getOrCompute<T>(derived: TgpuDerived<T>): T {
  // ... existing memoization logic ...
  
  // Derived computations run in COMPTIME mode, not JS mode
  pushMode(RuntimeMode.COMPTIME);
  const ctx = new ComptimeExecutionCtx();
  
  let result: T;
  try {
    result = provideComptimeCtx(ctx, () => derived['~compute']());
  } finally {
    popMode(RuntimeMode.COMPTIME);
  }
  
  // ... rest of existing logic ...
}
```

#### Update createDualImpl
**File**: `src/shared/generators.ts`

Clarify that dual implementations work in WGSL and JS modes only:

```typescript
export function createDualImpl<T extends (...args: never[]) => unknown>(
  jsImpl: T,
  wgslImpl: (...args: MapValueToSnippet<Parameters<T>>) => Snippet,
  name: string,
  argTypes?: FnArgsConversionHint,
): TgpuDualFn<T> {
  const impl = ((...args: Parameters<T>) => {
    if (inWGSLMode()) {
      return wgslImpl(...(args as MapValueToSnippet<Parameters<T>>)) as Snippet;
    } else if (inJSMode()) {
      return jsImpl(...args);
    } else {
      throw new Error(`Dual implementation not available in COMPTIME mode`);
    }
  }) as T;
  
  // ... rest unchanged
}
```

#### Add Tests
**File**: `tests/comptimeExecution.test.ts`

```typescript
describe('COMPTIME Execution', () => {
  it('should allow variable access in derived computations', () => {
    const x = tgpu.privateVar(d.f32, 1.0);
    
    const compute = tgpu.derived(() => {
      return x.value * 2; // This runs at resolution-time, not GPU runtime
    });
    
    expect(compute.value).toBe(2.0);
  });
  
  it('should allow variable assignment in derived computations', () => {
    const x = tgpu.privateVar(d.f32, 1.0);
    
    const compute = tgpu.derived(() => {
      x.value = 5.0; // Modifies the variable during preprocessing
      return x.value;
    });
    
    expect(compute.value).toBe(5.0);
  });
  
  it('should isolate variable state between derived computations', () => {
    const x = tgpu.privateVar(d.f32, 1.0);
    
    const compute1 = tgpu.derived(() => {
      x.value = 10.0;
      return x.value;
    });
    
    const compute2 = tgpu.derived(() => {
      return x.value; // Should see original value, not modified
    });
    
    expect(compute1.value).toBe(10.0);
    expect(compute2.value).toBe(1.0); // Isolated execution
  });
});
```

## Key Implementation Details

### 1. Minimal ExecutionCtx for COMPTIME

```typescript
class ComptimeExecutionCtx implements ExecutionCtx {
  private slotStack: WeakMap<TgpuSlot<any>, any>[] = [new WeakMap()];
  private variables = new WeakMap<TgpuVar<any, any>, any>();

  readSlot<T>(slot: TgpuSlot<T>): T | undefined {
    // Search slot stack from top to bottom
    for (let i = this.slotStack.length - 1; i >= 0; i--) {
      if (this.slotStack[i].has(slot)) {
        return this.slotStack[i].get(slot);
      }
    }
    return slot.defaultValue;
  }

  withSlots<T>(pairs: SlotValuePair[], callback: () => T): T {
    const newLayer = new WeakMap(pairs);
    this.slotStack.push(newLayer);
    try {
      return callback();
    } finally {
      this.slotStack.pop();
    }
  }

  unwrap<T>(eventual: Eventual<T>): T {
    // Simple unwrapping logic for COMPTIME mode
    if (isSlot(eventual)) {
      return this.readSlot(eventual);
    }
    if (isDerived(eventual)) {
      return eventual['~compute'](); // Recursive derived computation
    }
    return eventual;
  }

  readVariable<T>(variable: TgpuVar<any, T>): T {
    if (!this.variables.has(variable)) {
      // Initialize with default value for the data type
      const defaultValue = getDefaultValue(variable.dataType);
      this.variables.set(variable, defaultValue);
    }
    return this.variables.get(variable);
  }

  writeVariable<T>(variable: TgpuVar<any, T>, value: T): void {
    this.variables.set(variable, value);
  }
}
```

### 2. Backward Compatibility

ResolutionCtx remains unchanged - it already implements the needed slot operations. We just extend the interface:

```typescript
// ResolutionCtx already has these methods:
// - readSlot<T>(slot: TgpuSlot<T>): T
// - withSlots<T>(pairs: SlotValuePair[], callback: () => T): T  
// - unwrap<T>(eventual: Eventual<T>): T

// So we can make it implement ExecutionCtx with minimal changes
interface ResolutionCtx extends ExecutionCtx {
  // ... existing ResolutionCtx methods
}
```

### 3. Variable Scope Handling

For COMPTIME mode, we use simple WeakMap storage. Variable scoping is handled by derived computation boundaries:

```typescript
// privateVar: isolated per derived computation
// workgroupVar: shared across the execution context (but still COMPTIME)

class ComptimeExecutionCtx {
  private privateVars = new WeakMap<TgpuVar<'private', any>, any>();
  private workgroupVars = new WeakMap<TgpuVar<'workgroup', any>, any>();
  
  readVariable<T>(variable: TgpuVar<any, T>): T {
    const storage = variable.scope === 'private' ? this.privateVars : this.workgroupVars;
    // ... rest of implementation
  }
}
```

## Benefits of This Approach

1. **Correct Execution Model**: Properly separates WGSL, COMPTIME, and JS modes
2. **Minimal Changes**: Only touches the specific files that need COMPTIME support  
3. **No Breaking Changes**: ResolutionCtx remains unchanged, existing code works
4. **Simple Implementation**: Leverages existing slot logic, just adds COMPTIME storage
5. **Fast Timeline**: Can be implemented in 1 week with proper testing
6. **Future-Proof**: Provides foundation for more advanced preprocessing capabilities

## Success Criteria

1. Variables (privateVar, workgroupVar) work in COMPTIME mode (derived computations)
2. Derived values can access and modify variables during resolution
3. Slot system works identically in both WGSL and COMPTIME modes
4. createDualImpl correctly throws errors in COMPTIME mode
5. All existing tests pass
6. New tests validate COMPTIME execution functionality
7. Zero performance impact on existing WGSL and JS code paths

This focused approach delivers the core functionality needed while maintaining the correct execution model and keeping the implementation simple and maintainable.