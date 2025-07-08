# TypeGPU ExecutionCtx Implementation Plan

## Terminology

- **ExecutionCtx**: A context object that provides access to slots and manages dependency injection during code execution
- **ResolutionCtx**: The existing WGSL mode execution context used for GPU shader generation
- **ComptimeExecutionCtx**: A new execution context for resolution-time computations in derived values
- **Slot**: A dependency injection mechanism that works across WGSL and COMPTIME modes
- **Variable**: An execution construct that only works in WGSL and JS modes, not in COMPTIME
- **Derived Value**: A computed value that runs in COMPTIME mode and can access slots for dependency injection
- **Dual Implementation**: Functions that have both JavaScript and WGSL implementations, working in JS and WGSL modes respectively

## Overview

This document outlines a focused plan to enable slot access in COMPTIME mode for derived value computations. The key insight is that slots are a comptime mechanism for dependency injection, while variables should only be accessible in WGSL and JS modes.

## Current State

**The Problem**: Slot operations throw errors in COMPTIME mode because they expect a ResolutionCtx (WGSL mode only).

**The Execution Model**: TypeGPU has three execution modes with different capabilities:
- **WGSL Mode**: Code generation for GPU shaders (current ResolutionCtx) - has slots + variables
- **COMPTIME Mode**: Resolution-time computation for derived values - has slots only (dependency injection)
- **JS Mode**: Runtime JavaScript execution for dual implementations - has variables only

**The Solution**: Extend COMPTIME mode to support slot access for dependency injection in derived computations, while keeping variables restricted to WGSL and JS modes only.

## Implementation Plan (1 Week)

### Day 1-2: Core ExecutionCtx Infrastructure

#### Create ExecutionCtx Interface
**File**: `src/executionCtx.ts`

```typescript
interface ExecutionCtx {
  readSlot<T>(slot: TgpuSlot<T>): T | undefined;
  withSlots<T>(pairs: SlotValuePair[], callback: () => T): T;
  unwrap<T>(eventual: Eventual<T>): T;
}

class ComptimeExecutionCtx implements ExecutionCtx {
  private slotValues = new WeakMap<TgpuSlot<any>, any>();
  
  // Simple implementations that mirror ResolutionCtx slot logic
  // This runs during shader preprocessing for dependency injection
  // NO variable support - variables only work in WGSL and JS modes
}
```

#### Extend Runtime Mode System
**File**: `src/gpuMode.ts`

```typescript
type ExecutionMode = 'WGSL' | 'COMPTIME' | 'JS';

export const RuntimeMode = {
  WGSL: 'WGSL' as const,      // GPU shader generation (was GPU)
  COMPTIME: 'COMPTIME' as const, // Resolution-time computation (new)
  JS: 'JS' as const,          // Runtime JavaScript (was CPU)
} as const;

// Add COMPTIME execution context alongside existing ResolutionCtx
let comptimeExecutionCtx: ExecutionCtx | null = null;

export function getExecutionCtx(): ExecutionCtx | null {
  const currentMode = getCurrentMode();
  if (currentMode === 'WGSL') {
    return getResolutionCtx();
  } else if (currentMode === 'COMPTIME') {
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

export const inWGSLMode = () => getCurrentMode() === 'WGSL';
export const inComptimeMode = () => getCurrentMode() === 'COMPTIME';
export const inJSMode = () => getCurrentMode() === 'JS';
```

### Day 3: Variable System Clarification

#### Keep Variable Restrictions for COMPTIME Mode
**File**: `src/core/variable/tgpuVariable.ts`

Variables should remain restricted to WGSL and JS modes only:

```typescript
// Keep existing behavior - variables NOT accessible in COMPTIME mode
get value(): Infer<TDataType> {
  if (inWGSLMode()) {
    return this[$gpuValueOf](); // WGSL code generation
  } else if (inJSMode()) {
    // Enable JS mode access for dual implementations
    return this.getJSValue();
  } else {
    throw new Error('Variables only accessible in WGSL and JS modes, not COMPTIME');
  }
}

// Variables are for actual execution contexts, not dependency injection
```

#### Add JS Mode Variable Support
```typescript
// Add simple JS mode variable storage for dual implementations
private static jsVariables = new WeakMap<TgpuVar<any, any>, any>();

private getJSValue(): Infer<TDataType> {
  if (!TgpuVarImpl.jsVariables.has(this)) {
    const defaultValue = getDefaultValue(this._dataType);
    TgpuVarImpl.jsVariables.set(this, defaultValue);
  }
  return TgpuVarImpl.jsVariables.get(this);
}

set value(newValue: Infer<TDataType>) {
  if (inJSMode()) {
    TgpuVarImpl.jsVariables.set(this, newValue);
  } else {
    throw new Error('Variable assignment only allowed in JS mode');
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

**Note**: Slots work in both WGSL and COMPTIME modes for dependency injection, but derived values only compute in COMPTIME mode.

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
  it('should allow slot access in derived computations', () => {
    const multiplier = tgpu.slot(2.0);
    
    const compute = tgpu.derived(() => {
      return multiplier.value * 5; // Slots work in COMPTIME for dependency injection
    });
    
    expect(compute.value).toBe(10.0);
  });
  
  it('should NOT allow variable access in derived computations', () => {
    const x = tgpu.privateVar(d.f32, 1.0);
    
    const compute = tgpu.derived(() => {
      return x.value * 2; // This should throw - variables not in COMPTIME
    });
    
    expect(() => compute.value).toThrow('Variables only accessible in WGSL and JS modes');
  });
  
  it('should allow slot dependency injection in derived computations', () => {
    const base = tgpu.slot(5.0);
    const multiplier = tgpu.slot(3.0);
    
    const compute = tgpu.derived(() => {
      return base.value * multiplier.value; // Pure dependency injection
    });
    
    const withDifferentValues = compute.with(base, 10.0).with(multiplier, 2.0);
    
    expect(compute.value).toBe(15.0);
    expect(withDifferentValues.value).toBe(20.0);
  });
});

describe('JS Mode Variable Access', () => {
  it('should allow variable access in JS mode', () => {
    // Test that variables work in JS mode for dual implementations
    const x = tgpu.privateVar(d.f32, 1.0);
    
    // Simulate JS mode execution
    pushMode(RuntimeMode.JS);
    try {
      expect(x.value).toBe(1.0);
      x.value = 5.0;
      expect(x.value).toBe(5.0);
    } finally {
      popMode(RuntimeMode.JS);
    }
  });
});
```

## Key Implementation Details

### 1. Minimal ExecutionCtx for COMPTIME

```typescript
class ComptimeExecutionCtx implements ExecutionCtx {
  private slotStack: WeakMap<TgpuSlot<any>, any>[] = [new WeakMap()];

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

  // NO variable support - variables only work in WGSL and JS modes
  // COMPTIME is purely for slot-based dependency injection
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

### 3. Mode-Specific Capabilities

Each execution mode has different capabilities:

```typescript
// WGSL Mode (ResolutionCtx): Slots + Variables
// - Slots: For dependency injection in shader generation
// - Variables: For WGSL variable declarations

// COMPTIME Mode (ComptimeExecutionCtx): Slots only  
// - Slots: For dependency injection in derived computations
// - NO Variables: Variables are execution constructs, not comptime constructs

// JS Mode: Variables only
// - Variables: For dual implementation runtime state
// - NO Slots: Slots are resolved at comptime, not runtime

class JSModeVariableStorage {
  private static variables = new WeakMap<TgpuVar<any, any>, any>();
  
  static read<T>(variable: TgpuVar<any, T>): T {
    if (!this.variables.has(variable)) {
      const defaultValue = getDefaultValue(variable.dataType);
      this.variables.set(variable, defaultValue);
    }
    return this.variables.get(variable);
  }
  
  static write<T>(variable: TgpuVar<any, T>, value: T): void {
    this.variables.set(variable, value);
  }
}
```

## Benefits of This Approach

1. **Correct Execution Model**: Properly separates capabilities by mode
   - WGSL: Slots + Variables (shader generation)
   - COMPTIME: Slots only (dependency injection)  
   - JS: Variables only (runtime state)
2. **Minimal Changes**: Only adds COMPTIME slot support, no variable complexity
3. **No Breaking Changes**: ResolutionCtx remains unchanged, existing code works
4. **Simple Implementation**: Leverages existing slot logic for COMPTIME mode
5. **Fast Timeline**: Can be implemented in 1 week with proper testing
6. **Clear Separation**: Each mode has distinct, well-defined capabilities

## Success Criteria

1. Slots work in COMPTIME mode for derived value dependency injection
2. Variables remain restricted to WGSL and JS modes (no COMPTIME access)
3. Derived values can access slots but NOT variables during resolution
4. createDualImpl correctly throws errors in COMPTIME mode  
5. Variables work in JS mode for dual implementation runtime state
6. All existing tests pass
7. New tests validate COMPTIME slot access and variable restrictions
8. Zero performance impact on existing WGSL and JS code paths

This focused approach delivers slot-based dependency injection for derived values while maintaining clear separation of concerns between execution modes.