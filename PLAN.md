# TypeGPU ExecutionCtx Implementation Plan

## Overview

This document outlines a focused plan to enable slots, derived values, and privateVars to work on the CPU by creating a lightweight ExecutionCtx abstraction. The key insight is that ResolutionCtx is an implementation detail - we just need to track slot values in CPU mode.

## Current State

**The Problem**: Variables and some slot operations throw errors in CPU mode because they expect a ResolutionCtx (GPU mode only).

**The Solution**: Create a simple ExecutionCtx that tracks slot values and variable state for CPU execution, while keeping ResolutionCtx unchanged for GPU mode.

## Implementation Plan (1 Week)

### Day 1-2: Core ExecutionCtx Infrastructure

#### Create ExecutionCtx Interface
**File**: `src/executionCtx.ts`

```typescript
interface ExecutionCtx {
  readSlot<T>(slot: TgpuSlot<T>): T | undefined;
  withSlots<T>(pairs: SlotValuePair[], callback: () => T): T;
  unwrap<T>(eventual: Eventual<T>): T;
  
  // Variable support for CPU mode
  readVariable<T>(variable: TgpuVar<any, T>): T;
  writeVariable<T>(variable: TgpuVar<any, T>, value: T): void;
}

class CpuExecutionCtx implements ExecutionCtx {
  private slotValues = new WeakMap<TgpuSlot<any>, any>();
  private variables = new WeakMap<TgpuVar<any, any>, any>();
  
  // Simple implementations that mirror ResolutionCtx slot logic
}
```

#### Update Global Context Management
**File**: `src/gpuMode.ts`

```typescript
// Add CPU execution context alongside existing ResolutionCtx
let cpuExecutionCtx: ExecutionCtx | null = null;

export function getExecutionCtx(): ExecutionCtx | null {
  return inGPUMode() ? getResolutionCtx() : cpuExecutionCtx;
}

export function provideCpuCtx<T>(ctx: ExecutionCtx, callback: () => T): T {
  const prev = cpuExecutionCtx;
  cpuExecutionCtx = ctx;
  try {
    return callback();
  } finally {
    cpuExecutionCtx = prev;
  }
}
```

### Day 3: Variable System Updates

#### Remove CPU Mode Restrictions
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
  
  if (inGPUMode()) {
    return this[$gpuValueOf]();
  } else {
    return ctx.readVariable(this);
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
  
  if (inGPUMode()) {
    throw new Error('Cannot assign to variables in GPU mode');
  } else {
    ctx.writeVariable(this, newValue);
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

#### Update Function Execution
**File**: `src/core/function/tgpuFn.ts`

Enable CPU execution of functions with proper context:

```typescript
// When executing functions in CPU mode, provide ExecutionCtx
const executeCpuFunction = (fn: Function, args: any[]) => {
  const ctx = new CpuExecutionCtx();
  return provideCpuCtx(ctx, () => fn(...args));
};
```

#### Add Tests
**File**: `tests/cpuExecution.test.ts`

```typescript
describe('CPU Execution', () => {
  it('should allow variable access in CPU mode', () => {
    const x = tgpu.privateVar(d.f32, 1.0);
    
    const compute = tgpu.derived(() => {
      return x.value * 2;
    });
    
    expect(compute.value).toBe(2.0);
  });
  
  it('should allow variable assignment in CPU mode', () => {
    const x = tgpu.privateVar(d.f32, 1.0);
    
    const compute = tgpu.derived(() => {
      x.value = 5.0;
      return x.value;
    });
    
    expect(compute.value).toBe(5.0);
  });
});
```

## Key Implementation Details

### 1. Minimal ExecutionCtx for CPU

```typescript
class CpuExecutionCtx implements ExecutionCtx {
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
    // Simple unwrapping logic for CPU mode
    if (isSlot(eventual)) {
      return this.readSlot(eventual);
    }
    if (isDerived(eventual)) {
      return eventual['~compute']();
    }
    return eventual;
  }

  readVariable<T>(variable: TgpuVar<any, T>): T {
    if (!this.variables.has(variable)) {
      // Initialize with default value
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

For CPU mode, we use simple WeakMap storage. Variable scoping is handled by function call boundaries:

```typescript
// privateVar: isolated per function call
// workgroupVar: shared across the execution context

class CpuExecutionCtx {
  private privateVars = new WeakMap<TgpuVar<'private', any>, any>();
  private workgroupVars = new WeakMap<TgpuVar<'workgroup', any>, any>();
  
  readVariable<T>(variable: TgpuVar<any, T>): T {
    const storage = variable.scope === 'private' ? this.privateVars : this.workgroupVars;
    // ... rest of implementation
  }
}
```

## Benefits of This Approach

1. **Minimal Changes**: Only touches the specific files that need CPU support
2. **No Breaking Changes**: ResolutionCtx remains unchanged, existing code works
3. **Simple Implementation**: Leverages existing slot logic, just adds CPU storage
4. **Fast Timeline**: Can be implemented in 1 week with proper testing
5. **Future-Proof**: Provides foundation for more advanced CPU/GPU interop

## Success Criteria

1. Variables (privateVar, workgroupVar) work in CPU mode
2. Derived values can access and modify variables
3. Slot system works identically in both CPU and GPU modes
4. All existing tests pass
5. New tests validate CPU execution functionality
6. Zero performance impact on existing GPU code paths

This focused approach delivers the core functionality needed while keeping the implementation simple and maintainable.