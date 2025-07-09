import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import { derived } from '../src/core/slot/derived.ts';
import { slot } from '../src/core/slot/slot.ts';
import { privateVar } from '../src/core/variable/tgpuVariable.ts';
import { ExecutionCtxImpl } from '../src/executionCtx.ts';
import { 
  pushMode, 
  popMode, 
  RuntimeMode, 
  provideComptimeCtx, 
  provideSimulateCtx 
} from '../src/gpuMode.ts';
import { createDualImpl } from '../src/shared/generators.ts';

describe('ExecutionCtx System', () => {
  describe('COMPTIME Execution', () => {
    it('should allow slot access in derived computations', () => {
      const multiplier = slot(2.0);
      
      const compute = derived(() => {
        return multiplier.value * 5; // Slots work in COMPTIME for dependency injection
      });
      
      pushMode(RuntimeMode.COMPTIME);
      const ctx = new ExecutionCtxImpl();
      
      try {
        const result = provideComptimeCtx(ctx, () => compute.value);
        expect(result).toBe(10.0);
      } finally {
        popMode(RuntimeMode.COMPTIME);
      }
    });
    
    it('should NOT allow variable access in derived computations', () => {
      const x = privateVar(d.f32, 1.0);
      
      const compute = derived(() => {
        return x.value * 2; // This should throw - variables not in COMPTIME
      });
      
      pushMode(RuntimeMode.COMPTIME);
      const ctx = new ExecutionCtxImpl();
      
      try {
        expect(() => provideComptimeCtx(ctx, () => compute.value))
          .toThrow('Variables only accessible in CODEGEN and SIMULATE modes');
      } finally {
        popMode(RuntimeMode.COMPTIME);
      }
    });
    
    it('should allow slot dependency injection in derived computations', () => {
      const base = slot(5.0);
      const multiplier = slot(3.0);
      
      const compute = derived(() => {
        return base.value * multiplier.value; // Pure dependency injection
      });
      
      const withDifferentValues = compute.with(base, 10.0).with(multiplier, 2.0);
      
      pushMode(RuntimeMode.COMPTIME);
      const ctx = new ExecutionCtxImpl();
      
      try {
        const result1 = provideComptimeCtx(ctx, () => compute.value);
        const result2 = provideComptimeCtx(ctx, () => withDifferentValues.value);
        
        expect(result1).toBe(15.0);
        expect(result2).toBe(20.0);
      } finally {
        popMode(RuntimeMode.COMPTIME);
      }
    });
  });

  describe('SIMULATE Mode Variable Access', () => {
    it('should allow variable access in SIMULATE mode', () => {
      const x = privateVar(d.f32, 1.0);
      
      pushMode(RuntimeMode.SIMULATE);
      const ctx = new ExecutionCtxImpl();
      
      try {
        provideSimulateCtx(ctx, () => {
          expect(x.value).toBe(1.0);
          x.value = 5.0;
          expect(x.value).toBe(5.0);
        });
      } finally {
        popMode(RuntimeMode.SIMULATE);
      }
    });

    it('should allow slot access in SIMULATE mode', () => {
      const multiplier = slot(3.0);
      
      pushMode(RuntimeMode.SIMULATE);
      const ctx = new ExecutionCtxImpl();
      
      try {
        const result = provideSimulateCtx(ctx, () => multiplier.value);
        expect(result).toBe(3.0);
      } finally {
        popMode(RuntimeMode.SIMULATE);
      }
    });

    it('should support both slots and variables in SIMULATE mode', () => {
      const multiplier = slot(2.0);
      const x = privateVar(d.f32, 3.0);
      
      pushMode(RuntimeMode.SIMULATE);
      const ctx = new ExecutionCtxImpl();
      
      try {
        provideSimulateCtx(ctx, () => {
          const result = multiplier.value * x.value;
          expect(result).toBe(6.0);
          
          x.value = 4.0;
          const newResult = multiplier.value * x.value;
          expect(newResult).toBe(8.0);
        });
      } finally {
        popMode(RuntimeMode.SIMULATE);
      }
    });
  });

  describe('Dual Implementation Functions', () => {
    it('should work in SIMULATE mode', () => {
      const add = createDualImpl(
        (a: number, b: number) => a + b,
        (a, b) => ({ value: `${a.value} + ${b.value}`, dataType: d.f32 }),
        'add'
      );

      pushMode(RuntimeMode.SIMULATE);
      const ctx = new ExecutionCtxImpl();
      
      try {
        const result = provideSimulateCtx(ctx, () => add(3, 4));
        expect(result).toBe(7);
      } finally {
        popMode(RuntimeMode.SIMULATE);
      }
    });

    it('should throw error in COMPTIME mode', () => {
      const add = createDualImpl(
        (a: number, b: number) => a + b,
        (a, b) => ({ value: `${a.value} + ${b.value}`, dataType: d.f32 }),
        'add'
      );

      pushMode(RuntimeMode.COMPTIME);
      const ctx = new ExecutionCtxImpl();
      
      try {
        expect(() => provideComptimeCtx(ctx, () => add(3, 4)))
          .toThrow('Dual implementation not available in COMPTIME mode');
      } finally {
        popMode(RuntimeMode.COMPTIME);
      }
    });
  });

  describe('ExecutionCtx Interface', () => {
    it('should provide unified slot access across modes', () => {
      const testSlot = slot(42);
      const ctx = new ExecutionCtxImpl();
      
      // Test readSlot
      expect(ctx.readSlot(testSlot)).toBe(42);
      
      // Test withSlots
      const result = ctx.withSlots([[testSlot, 100]], () => {
        return ctx.readSlot(testSlot);
      });
      expect(result).toBe(100);
      
      // Test unwrap
      expect(ctx.unwrap(testSlot)).toBe(42);
    });

    it('should handle nested slot bindings', () => {
      const slot1 = slot(1);
      const slot2 = slot(2);
      const ctx = new ExecutionCtxImpl();
      
      const result = ctx.withSlots([[slot1, 10]], () => {
        return ctx.withSlots([[slot2, 20]], () => {
          return ctx.readSlot(slot1)! + ctx.readSlot(slot2)!;
        });
      });
      
      expect(result).toBe(30);
    });
  });
});