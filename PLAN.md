# TypeGPU ExecutionCtx Implementation Plan

## Terminology

- **ExecutionCtx**: A unified context object that provides access to slots and manages dependency injection during code execution across all modes
- **ResolutionCtx**: The existing CODEGEN mode execution context used for GPU shader generation (supertype of ExecutionCtx)
- **ResolutionCtxImpl**: The existing implementation of ResolutionCtx
- **ExecutionCtxImpl**: A new implementation of ExecutionCtx for SIMULATE and COMPTIME modes
- **Slot**: A dependency injection mechanism that works across all modes (CODEGEN, COMPTIME, SIMULATE)
- **Variable**: An execution construct that only works in CODEGEN and SIMULATE modes, not in COMPTIME
- **Derived Value**: A computed value that runs in COMPTIME mode and can access slots for dependency injection
- **Dual Implementation**: Functions that have both JavaScript and WGSL implementations, working in SIMULATE and CODEGEN modes respectively

## Overview

This document outlines a plan to enable CPU simulation of GPU shaders by implementing a unified ExecutionCtx system. The main goal is to allow users to run their shader code on the CPU for testing, debugging, and development purposes. This requires supporting variables in SIMULATE mode and slots in COMPTIME mode for dependency injection.

## Current State

**The Problem**: Users cannot simulate shader execution on the CPU because:
1. Variables don't work in SIMULATE mode (needed for CPU execution)
2. Slot operations throw errors in COMPTIME mode (needed for dependency injection)
3. No unified execution context system across the three modes

**The Execution Model**: TypeGPU has three execution modes with different capabilities:
- **CODEGEN Mode**: Code generation for GPU shaders (current ResolutionCtx) - has slots + variables
- **COMPTIME Mode**: Resolution-time computation for derived values - has slots only (dependency injection)
- **SIMULATE Mode**: Runtime JavaScript execution for dual implementations - has slots + variables

**The Solution**: Create a unified ExecutionCtx system that enables:
1. **CPU Shader Simulation**: Variables work in SIMULATE mode for JavaScript execution
2. **Universal Dependency Injection**: Slots work in all modes (CODEGEN, COMPTIME, SIMULATE)
3. **Unified Interface**: Single ExecutionCtx interface across all execution modes
4. **Clear Separation**: Each mode has distinct capabilities while sharing the same interface

## Implementation Plan (1 Week)

### Day 1-2: Core ExecutionCtx Infrastructure

#### Create Unified ExecutionCtx Interface
**File**: `src/executionCtx.ts`

```typescript
interface ExecutionCtx {
  readSlot<T>(slot: TgpuSlot<T>): T | undefined;
  withSlots<T>(pairs: SlotValuePair[], callback: () => T): T;
  unwrap<T>(eventual: Eventual<T>): T;
  
  // Variable storage methods for SIMULATE mode
  readVariable<T>(variable: any): T | undefined;
  writeVariable<T>(variable: any, value: T): void;
}

// ResolutionCtxImpl already implements these methods for CODEGEN mode
// We'll add ExecutionCtxImpl for COMPTIME and SIMULATE modes
class ExecutionCtxImpl implements ExecutionCtx {
  private slotStack: WeakMap<TgpuSlot<any>, any>[] = [new WeakMap()];
  private variableStorage = new WeakMap<any, any>();
  
  // Can share implementation with ResolutionCtxImpl since ResolutionCtx is a supertype of ExecutionCtx
  // Used for both COMPTIME (slots only) and SIMULATE (slots + variables) modes
}
```

#### Extend Runtime Mode System
**File**: `src/gpuMode.ts`

```typescript
type ExecutionMode = 'CODEGEN' | 'COMPTIME' | 'SIMULATE';

export const RuntimeMode = {
  CODEGEN: 'CODEGEN' as const,      // GPU shader generation (was WGSL)
  COMPTIME: 'COMPTIME' as const, // Resolution-time computation (new)
  SIMULATE: 'SIMULATE' as const,          // Runtime JavaScript (was JS)
} as const;

// Add execution contexts for COMPTIME and SIMULATE modes alongside existing ResolutionCtx
let comptimeExecutionCtx: ExecutionCtx | null = null;
let simulateExecutionCtx: ExecutionCtx | null = null;

export function getExecutionCtx(): ExecutionCtx | null {
  const currentMode = getCurrentMode();
  if (currentMode === 'CODEGEN') {
    return getResolutionCtx(); // ResolutionCtxImpl implements ExecutionCtx (via ResolutionCtx)
  } else if (currentMode === 'COMPTIME') {
    return comptimeExecutionCtx; // ExecutionCtxImpl
  } else if (currentMode === 'SIMULATE') {
    return simulateExecutionCtx; // ExecutionCtxImpl
  }
  return null;
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

export function provideSimulateCtx<T>(ctx: ExecutionCtx, callback: () => T): T {
  const prev = simulateExecutionCtx;
  simulateExecutionCtx = ctx;
  try {
    return callback();
  } finally {
    simulateExecutionCtx = prev;
  }
}

export const inCodegenMode = () => getCurrentMode() === 'CODEGEN';
export const inComptimeMode = () => getCurrentMode() === 'COMPTIME';
export const inSimulateMode = () => getCurrentMode() === 'SIMULATE';
```

### Day 3: Variable System Clarification

#### Keep Variable Restrictions for COMPTIME Mode
**File**: `src/core/variable/tgpuVariable.ts`

Variables should remain restricted to CODEGEN and SIMULATE modes only:

```typescript
// Keep existing behavior - variables NOT accessible in COMPTIME mode
get value(): Infer<TDataType> {
  if (inCodegenMode()) {
    return this[$gpuValueOf](); // CODEGEN code generation
  } else if (inSimulateMode()) {
    // Enable SIMULATE mode access for dual implementations
    return this.getSimulateValue();
  } else {
    throw new Error('Variables only accessible in CODEGEN and SIMULATE modes, not COMPTIME');
  }
}

// Variables are for actual execution contexts, not dependency injection
```

#### Add SIMULATE Mode Variable Support
```typescript
// Variables now use execution context storage instead of global storage
private getSimulateValue(): Infer<TDataType> {
  const ctx = getExecutionCtx();
  if (!ctx) {
    throw new Error('Cannot access variable value outside of execution context in SIMULATE mode');
  }
  
  let value = ctx.readVariable<Infer<TDataType>>(this);
  if (value === undefined) {
    const defaultValue = this._initialValue ?? getDefaultValue(this._dataType);
    ctx.writeVariable(this, defaultValue);
    value = defaultValue;
  }
  return value;
}

set value(newValue: Infer<TDataType>) {
  if (inSimulateMode()) {
    const ctx = getExecutionCtx();
    if (!ctx) {
      throw new Error('Cannot assign variable value outside of execution context in SIMULATE mode');
    }
    ctx.writeVariable(this, newValue);
  } else {
    throw new Error('Variable assignment only allowed in SIMULATE mode');
  }
}
```

### Day 4: Slot System Integration

#### Update Slot Implementation
**File**: `src/core/slot/slot.ts`

```typescript
[$gpuValueOf](ctx: ExecutionCtx): InferGPU<T> {
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

**Note**: Slots work in all modes for dependency injection, but derived values only compute in COMPTIME mode.

### Day 5: Function Integration & Testing

#### Update Derived Value Computation
**File**: `src/resolutionCtx.ts`

Update derived computation to run in COMPTIME mode:

```typescript
_getOrCompute<T>(derived: TgpuDerived<T>): T {
  // ... existing memoization logic ...
  
  // Derived computations run in COMPTIME mode, not SIMULATE mode
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

Clarify that dual implementations work in CODEGEN and SIMULATE modes only:

```typescript
export function createDualImpl<T extends (...args: never[]) => unknown>(
  jsImpl: T,
  wgslImpl: (...args: MapValueToSnippet<Parameters<T>>) => Snippet,
  name: string,
  argTypes?: FnArgsConversionHint,
): TgpuDualFn<T> {
  const impl = ((...args: Parameters<T>) => {
    if (inCodegenMode()) {
      return wgslImpl(...(args as MapValueToSnippet<Parameters<T>>)) as Snippet;
    } else if (inSimulateMode()) {
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
    
    expect(() => compute.value).toThrow('Variables only accessible in CODEGEN and SIMULATE modes');
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

describe('SIMULATE Mode Variable Access', () => {
  it('should allow variable access in SIMULATE mode', () => {
    // Test that variables work in SIMULATE mode for dual implementations
    const x = tgpu.privateVar(d.f32, 1.0);
    
    // Simulate SIMULATE mode execution
    pushMode(RuntimeMode.SIMULATE);
    try {
      expect(x.value).toBe(1.0);
      x.value = 5.0;
      expect(x.value).toBe(5.0);
    } finally {
      popMode(RuntimeMode.SIMULATE);
    }
  });
});
```

## Key Implementation Details

### 1. Unified ExecutionCtxImpl for COMPTIME and SIMULATE

```typescript
class ExecutionCtxImpl implements ExecutionCtx {
  private slotStack: WeakMap<TgpuSlot<any>, any>[] = [new WeakMap()];

  readSlot<T>(slot: TgpuSlot<T>): T | undefined {
    // Shared implementation with ResolutionCtxImpl
    for (let i = this.slotStack.length - 1; i >= 0; i--) {
      if (this.slotStack[i].has(slot)) {
        return this.slotStack[i].get(slot);
      }
    }
    return slot.defaultValue;
  }

  withSlots<T>(pairs: SlotValuePair[], callback: () => T): T {
    // Shared implementation with ResolutionCtxImpl
    const newLayer = new WeakMap(pairs);
    this.slotStack.push(newLayer);
    try {
      return callback();
    } finally {
      this.slotStack.pop();
    }
  }

  unwrap<T>(eventual: Eventual<T>): T {
    // Shared implementation with ResolutionCtxImpl
    if (isSlot(eventual)) {
      return this.readSlot(eventual);
    }
    if (isDerived(eventual)) {
      return eventual['~compute']();
    }
    return eventual;
  }

  // Used for both COMPTIME (slots only) and SIMULATE (slots + variables) modes
  // Can share slot implementation with ResolutionCtxImpl since ResolutionCtx extends ExecutionCtx
}
```

### 2. Backward Compatibility

ResolutionCtx remains unchanged - it's a supertype of ExecutionCtx. ResolutionCtxImpl already implements the needed slot operations:

```typescript
// ResolutionCtx is a supertype of ExecutionCtx with additional methods:
// - readSlot<T>(slot: TgpuSlot<T>): T
// - withSlots<T>(pairs: SlotValuePair[], callback: () => T): T  
// - unwrap<T>(eventual: Eventual<T>): T
// + additional ResolutionCtx-specific methods

interface ResolutionCtx extends ExecutionCtx {
  // ... existing ResolutionCtx methods
}

// ResolutionCtxImpl can be used as-is for CODEGEN mode
```

### 3. ExecutionCtxImpl Implementation

```typescript
class ExecutionCtxImpl implements ExecutionCtx {
  private slotStack: WeakMap<TgpuSlot<any>, any>[] = [new WeakMap()];
  private variableStorage = new WeakMap<any, any>();

  readSlot<T>(slot: TgpuSlot<T>): T | undefined {
    // Can share implementation with ResolutionCtxImpl
    for (let i = this.slotStack.length - 1; i >= 0; i--) {
      if (this.slotStack[i].has(slot)) {
        return this.slotStack[i].get(slot);
      }
    }
    return slot.defaultValue;
  }

  withSlots<T>(pairs: SlotValuePair[], callback: () => T): T {
    // Can share implementation with ResolutionCtxImpl
    const newLayer = new WeakMap(pairs);
    this.slotStack.push(newLayer);
    try {
      return callback();
    } finally {
      this.slotStack.pop();
    }
  }

  unwrap<T>(eventual: Eventual<T>): T {
    // Can share implementation with ResolutionCtxImpl
    if (isSlot(eventual)) {
      return this.readSlot(eventual);
    }
    if (isDerived(eventual)) {
      return eventual['~compute']();
    }
    return eventual;
  }

  readVariable<T>(variable: any): T | undefined {
    return this.variableStorage.get(variable);
  }

  writeVariable<T>(variable: any, value: T): void {
    this.variableStorage.set(variable, value);
  }

  // Used for both COMPTIME and SIMULATE modes
  // Can share slot logic with ResolutionCtxImpl since ResolutionCtx extends ExecutionCtx
}
```

### 4. Mode-Specific Capabilities

Each execution mode has different capabilities:

```typescript
// CODEGEN Mode (ResolutionCtx): Slots + Variables
// - Slots: For dependency injection in shader generation
// - Variables: For CODEGEN variable declarations

// COMPTIME Mode (ComptimeExecutionCtx): Slots only  
// - Slots: For dependency injection in derived computations
// - NO Variables: Variables are execution constructs, not comptime constructs

// SIMULATE Mode: Slots + Variables
// - Slots: For dependency injection in CPU simulation
// - Variables: For dual implementation runtime state

// Variable storage is now handled by ExecutionCtx instances
// Each execution context maintains its own variable storage via WeakMap
// This ensures proper isolation between different execution contexts
```

## Benefits of This Approach

1. **Unified Interface**: Single ExecutionCtx interface across all execution modes
   - CODEGEN: Slots + Variables (shader generation) via ResolutionCtxImpl
   - COMPTIME: Slots only (dependency injection) via ExecutionCtxImpl
   - SIMULATE: Slots + Variables (CPU simulation) via ExecutionCtxImpl
2. **Context-Scoped Variables**: Variables are now stored in execution context instead of globally
   - Better isolation between different execution contexts
   - Proper cleanup when execution contexts are destroyed
   - More predictable behavior in concurrent scenarios
3. **No Breaking Changes**: ResolutionCtx remains unchanged, existing code works
4. **Simple Implementation**: Leverages existing slot logic for COMPTIME mode
5. **Fast Timeline**: Can be implemented in 1 week with proper testing
6. **Clear Separation**: Each mode has distinct, well-defined capabilities but unified interface

## Success Criteria

1. Slots work in COMPTIME mode for derived value dependency injection
2. Variables remain restricted to CODEGEN and SIMULATE modes (no COMPTIME access)
3. Derived values can access slots but NOT variables during resolution
4. createDualImpl correctly throws errors in COMPTIME mode  
5. Variables work in SIMULATE mode for dual implementation runtime state
6. All existing tests pass
7. New tests validate COMPTIME slot access and variable restrictions
8. Zero performance impact on existing CODEGEN and SIMULATE code paths

This focused approach delivers slot-based dependency injection for derived values while maintaining clear separation of concerns between execution modes.