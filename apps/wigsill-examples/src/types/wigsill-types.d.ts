import * as TB from 'typed-binary';
import { ISchema, Parsed, AnySchema, Schema, Unwrap, ISerialOutput, ParseUnwrapped, ISerialInput, MaxValue, IMeasurer, UnwrapRecord } from 'typed-binary';

declare class WGSLCode implements WGSLItem {
    readonly segments: WGSLSegment[];
    constructor(segments: WGSLSegment[]);
    resolve(ctx: IResolutionCtx): string;
}
declare function code(strings: TemplateStringsArray, ...params: (WGSLSegment | WGSLSegment[])[]): WGSLCode;

declare class WGSLIdentifier implements WGSLItem {
    debugLabel?: string | undefined;
    alias(debugLabel: string): void;
    resolve(ctx: IResolutionCtx): string;
}
declare function identifier(debugLabel?: string): WGSLIdentifier;

type MemoryArenaOptions = {
    readonly usage: number;
    readonly bufferBindingType: GPUBufferBindingType;
    readonly minSize?: number;
    readonly memoryEntries: WGSLMemoryTrait[];
};
/**
 * TODO: Documentation
 * A place for grouping WGSL memory items.
 */
declare class MemoryArena {
    private _memoryOffsetMap;
    readonly bufferBindingType: GPUBufferBindingType;
    readonly usage: number;
    readonly size: number;
    readonly memoryEntries: WGSLMemoryTrait[];
    readonly identifier: WGSLIdentifier;
    debugLabel?: string | undefined;
    constructor(options: MemoryArenaOptions);
    alias(debugLabel: string): void;
    offsetFor(memoryEntry: WGSLMemoryTrait): number | null;
    definitionCode(bindingGroup: number, bindingIdx: number): WGSLCode | undefined;
}
declare function makeArena(options: MemoryArenaOptions): MemoryArena;

type WGSLSegment = string | number | WGSLItem;
interface IResolutionCtx {
    addDependency(item: WGSLItem): void;
    addMemory(memoryEntry: WGSLMemoryTrait): void;
    nameFor(token: WGSLItem): string;
    arenaFor(memoryEntry: WGSLMemoryTrait): MemoryArena | null;
    /** @throws {MissingBindingError}  */
    requireBinding<T>(bindable: WGSLBindableTrait<T>): T;
    tryBinding<T>(bindable: WGSLBindableTrait<T>, defaultValue: T): T;
    resolve(item: WGSLSegment): string;
}
interface WGSLItem {
    readonly debugLabel?: string | undefined;
    resolve(ctx: IResolutionCtx): string;
}
declare function isWGSLItem(value: unknown): value is WGSLItem;
declare function isWGSLSegment(value: unknown): value is WGSLSegment;
interface WGSLBindableTrait<TBinding> {
    /** type-token, not available at runtime */
    readonly __bindingType: TBinding;
    readonly debugLabel?: string | undefined;
}
type WGSLBindPair<T> = [WGSLBindableTrait<T>, T];
interface WGSLMemoryTrait extends WGSLItem {
    readonly size: number;
    readonly baseAlignment: number;
    readonly structFieldDefinition: WGSLSegment;
}
type MemoryLocation = {
    gpuBuffer: GPUBuffer;
    offset: number;
};

declare class MissingBindingError extends Error {
    readonly bindable: WGSLBindableTrait<unknown>;
    constructor(bindable: WGSLBindableTrait<unknown>);
}
declare class MemoryArenaConflictError extends Error {
    constructor(memoryEntry: WGSLMemoryTrait);
}
declare class NotAllocatedMemoryError extends Error {
    constructor(memoryEntry: WGSLMemoryTrait);
}
declare class RecursiveDataTypeError extends Error {
    constructor();
}

interface WGSLDataType<TInner> extends ISchema<TInner>, WGSLItem {
    readonly byteAlignment: number;
    readonly size: number;
}
type AnyWGSLDataType = WGSLDataType<unknown>;
interface WGSLPointerType<TScope extends 'function', TInner extends AnyWGSLDataType> {
    readonly scope: TScope;
    readonly pointsTo: TInner;
}
/**
 * A virtual representation of a WGSL value.
 */
type WGSLValue<TDataType> = {
    readonly __dataType: TDataType;
};
type AnyWGSLPointerType = WGSLPointerType<'function', AnyWGSLDataType>;
type WGSLFnArgument = AnyWGSLPointerType | AnyWGSLDataType;

type VariableScope = 'private';
/**
 * Creates a variable, with an optional initial value.
 */
declare class WGSLVariable<TDataType extends AnyWGSLDataType> implements WGSLItem {
    private readonly _dataType;
    private readonly _initialValue;
    readonly scope: VariableScope;
    identifier: WGSLIdentifier;
    constructor(_dataType: TDataType, _initialValue: WGSLSegment | undefined, scope: VariableScope);
    alias(debugLabel: string): this;
    resolve(ctx: IResolutionCtx): string;
}

/**
 * Creates a constant is computed at shader initialization according
 * to the passed in expression.
 */
declare class WGSLConstant implements WGSLItem {
    private readonly expr;
    debugLabel?: string | undefined;
    identifier: WGSLIdentifier;
    constructor(expr: WGSLSegment);
    alias(debugLabel: string): this;
    resolve(ctx: IResolutionCtx): string;
}
declare function constant(expr: WGSLSegment): WGSLConstant;

declare abstract class Callable<TArgs extends [...any[]], TReturn> extends Function {
    _bound: Callable<TArgs, TReturn>;
    constructor();
    abstract _call(...args: TArgs): TReturn;
}
interface ICallable<TArgs extends [...any[]], TReturn> {
    (...args: TArgs): TReturn;
}
type AsCallable<T, TArgs extends [...any[]], TReturn> = T & ICallable<TArgs, TReturn>;

type ValuesFromTypes<TArgTypes extends WGSLFnArgument[]> = {
    [K in keyof TArgTypes]: WGSLValue<TArgTypes[K]> & WGSLIdentifier;
};
type PairsFromTypes<TArgTypes extends WGSLFnArgument[]> = {
    [K in keyof TArgTypes]: readonly [WGSLIdentifier, TArgTypes[K]];
};
type SegmentsFromTypes<TArgTypes extends WGSLFnArgument[]> = {
    [K in keyof TArgTypes]: WGSLSegment;
};
declare class WGSLFunctionCall<TArgTypes extends [WGSLFnArgument, ...WGSLFnArgument[]] | [], TReturn extends AnyWGSLDataType | undefined = undefined> implements WGSLItem {
    private usedFn;
    private readonly args;
    constructor(usedFn: WGSLFunction$1<TArgTypes, TReturn>, args: SegmentsFromTypes<TArgTypes>);
    resolve(ctx: IResolutionCtx): string;
}
declare class WGSLFunction$1<TArgTypes extends [WGSLFnArgument, ...WGSLFnArgument[]] | [], TReturn extends AnyWGSLDataType | undefined = undefined> extends Callable<SegmentsFromTypes<TArgTypes>, WGSLFunctionCall<TArgTypes>> implements WGSLItem {
    private argPairs;
    private returnType;
    private readonly body;
    private identifier;
    constructor(argPairs: PairsFromTypes<TArgTypes>, returnType: TReturn | undefined, body: WGSLSegment);
    alias(debugLabel: string): this;
    resolve(ctx: IResolutionCtx): string;
    _call(...args: SegmentsFromTypes<TArgTypes>): WGSLFunctionCall<TArgTypes, TReturn>;
}
declare function fn$1<TArgTypes extends [WGSLFnArgument, ...WGSLFnArgument[]] | [], TReturn extends AnyWGSLDataType | undefined = undefined>(argTypes: TArgTypes, returnType?: TReturn): (bodyProducer: (...args: ValuesFromTypes<TArgTypes>) => WGSLCode) => AsCallable<WGSLFunction$1<TArgTypes, TReturn>, SegmentsFromTypes<TArgTypes>, WGSLFunctionCall<TArgTypes, undefined>>;

declare class WGSLFunction implements WGSLItem {
    private readonly body;
    private identifier;
    constructor(body: WGSLSegment);
    alias(debugLabel: string): this;
    resolve(ctx: IResolutionCtx): string;
}
declare function fn(debugLabel?: string): (strings: TemplateStringsArray, ...params: WGSLSegment[]) => WGSLFunction;

/**
 * Holds all data that is necessary to facilitate CPU and GPU communication.
 * Programs that share a runtime can interact via GPU buffers.
 */
declare class WGSLRuntime {
    readonly device: GPUDevice;
    private _arenaToBufferMap;
    private _entryToArenaMap;
    constructor(device: GPUDevice);
    dispose(): void;
    registerArena(arena: MemoryArena): void;
    bufferFor(arena: MemoryArena): GPUBuffer;
    locateMemory(memoryEntry: WGSLMemoryTrait): MemoryLocation | null;
}

declare class WGSLMemory<TSchema extends AnyWGSLDataType> implements WGSLItem, WGSLMemoryTrait {
    private readonly _typeSchema;
    private fieldIdentifier;
    structFieldDefinition: WGSLCode;
    debugLabel?: string | undefined;
    readonly size: number;
    readonly baseAlignment: number;
    constructor(_typeSchema: TSchema);
    alias(debugLabel: string): this;
    /**
     * @throws {NotAllocatedMemoryError}
     */
    resolve(ctx: IResolutionCtx): string;
    write(runtime: WGSLRuntime, data: Parsed<TSchema>): boolean;
}
declare function memory<TSchema extends AnyWGSLDataType>(typeSchema: TSchema): WGSLMemory<TSchema>;

declare class WGSLRequire implements WGSLItem {
    private readonly item;
    constructor(item: WGSLItem);
    resolve(ctx: IResolutionCtx): string;
}
declare function require(item: WGSLItem): WGSLRequire;

interface Slot<T> {
    __brand: 'Slot';
    /** type-token, not available at runtime */
    __bindingType: T;
}
interface ResolvableSlot<T extends WGSLSegment> extends WGSLItem {
    __brand: 'Slot';
    /** type-token, not available at runtime */
    __bindingType: T;
}
declare class WGSLSlot<T> implements WGSLItem, WGSLBindableTrait<T> {
    defaultValue?: T | undefined;
    __bindingType: T;
    __brand: "Slot";
    debugLabel?: string | undefined;
    constructor(defaultValue?: T | undefined);
    alias(debugLabel: string): this;
    private getValue;
    resolve(ctx: IResolutionCtx): string;
}
declare function slot<T extends WGSLSegment>(defaultValue?: T): ResolvableSlot<T>;
declare function slot<T>(defaultValue?: T): Slot<T>;

declare const _default: typeof code & {
    code: typeof code;
    fn: typeof fn;
    fun: typeof fn$1;
    identifier: typeof identifier;
    memory: typeof memory;
    slot: typeof slot;
    constant: typeof constant;
    require: typeof require;
    var: <TDataType extends AnyWGSLDataType>(dataType: TDataType, initialValue?: WGSLSegment | undefined) => WGSLVariable<TDataType>;
};

interface NameRegistry {
    nameFor(item: WGSLItem): string;
}
declare class RandomNameRegistry implements NameRegistry {
    private lastUniqueId;
    private names;
    nameFor(item: WGSLItem): string;
}
declare class StrictNameRegistry implements NameRegistry {
    nameFor(item: WGSLItem): string;
}

type Program = {
    bindGroupLayout: GPUBindGroupLayout;
    bindGroup: GPUBindGroup;
    code: string;
};
type BuildOptions = {
    shaderStage: number;
    bindingGroup: number;
    arenas?: MemoryArena[];
    nameRegistry?: NameRegistry;
};
declare class ProgramBuilder {
    private runtime;
    private root;
    private bindings;
    constructor(runtime: WGSLRuntime, root: WGSLItem);
    provide<T>(bindable: WGSLBindableTrait<T>, value: T): this;
    build(options: BuildOptions): Program;
}

declare class SimpleWGSLDataType<TSchema extends AnySchema> extends Schema<Unwrap<TSchema>> implements WGSLDataType<Unwrap<TSchema>> {
    readonly size: number;
    readonly byteAlignment: number;
    private readonly _innerSchema;
    private readonly _expressionCode;
    /**
     * byteAlignment has to be a power of 2
     */
    constructor({ schema, byteAlignment, code, }: {
        schema: TSchema;
        byteAlignment: number;
        code: WGSLSegment;
    });
    resolveReferences(): void;
    write(output: ISerialOutput, value: ParseUnwrapped<TSchema>): void;
    read(input: ISerialInput): ParseUnwrapped<TSchema>;
    measure(value: ParseUnwrapped<TSchema> | MaxValue, measurer?: IMeasurer): IMeasurer;
    resolve(ctx: IResolutionCtx): string;
}

declare const bool: SimpleWGSLDataType<TB.BoolSchema>;
declare const u32: SimpleWGSLDataType<TB.Uint32Schema>;
declare const i32: SimpleWGSLDataType<TB.Int32Schema>;
declare const f32: SimpleWGSLDataType<TB.Float32Schema>;
declare const vec2u: SimpleWGSLDataType<TB.TupleSchema<[TB.Uint32Schema, TB.Uint32Schema]>>;
declare const vec2i: SimpleWGSLDataType<TB.TupleSchema<[TB.Int32Schema, TB.Int32Schema]>>;
declare const vec2f: SimpleWGSLDataType<TB.TupleSchema<[TB.Float32Schema, TB.Float32Schema]>>;
declare const vec3u: SimpleWGSLDataType<TB.TupleSchema<[TB.Uint32Schema, TB.Uint32Schema, TB.Uint32Schema]>>;
declare const vec3i: SimpleWGSLDataType<TB.TupleSchema<[TB.Int32Schema, TB.Int32Schema, TB.Int32Schema]>>;
declare const vec3f: SimpleWGSLDataType<TB.TupleSchema<[TB.Float32Schema, TB.Float32Schema, TB.Float32Schema]>>;
declare const vec4u: SimpleWGSLDataType<TB.TupleSchema<[TB.Uint32Schema, TB.Uint32Schema, TB.Uint32Schema, TB.Uint32Schema]>>;
declare const vec4i: SimpleWGSLDataType<TB.TupleSchema<[TB.Int32Schema, TB.Int32Schema, TB.Int32Schema, TB.Int32Schema]>>;
declare const vec4f: SimpleWGSLDataType<TB.TupleSchema<[TB.Float32Schema, TB.Float32Schema, TB.Float32Schema, TB.Float32Schema]>>;
/**
 * Array of column vectors
 */
declare const mat4f: SimpleWGSLDataType<TB.ArraySchema<TB.Float32Schema>>;

declare class DynamicArrayDataType<TElement extends WGSLDataType<unknown>> extends Schema<Unwrap<TElement>[]> implements WGSLDataType<Unwrap<TElement>[]> {
    private readonly _elementType;
    readonly capacity: number;
    private readonly _identifier;
    private readonly _definitionCode;
    readonly byteAlignment: number;
    readonly size: number;
    constructor(_elementType: TElement, capacity: number);
    alias(debugLabel: string): this;
    resolveReferences(): void;
    write(output: ISerialOutput, values: ParseUnwrapped<TElement>[]): void;
    read(input: ISerialInput): ParseUnwrapped<TElement>[];
    measure(_values: ParseUnwrapped<TElement>[] | typeof MaxValue, measurer?: IMeasurer): IMeasurer;
    resolve(ctx: IResolutionCtx): string;
}
declare const dynamicArrayOf: <TSchema extends AnyWGSLDataType>(elementType: TSchema, capacity: number) => DynamicArrayDataType<TSchema>;

declare class StructDataType<TProps extends Record<string, AnyWGSLDataType>> extends Schema<UnwrapRecord<TProps>> implements WGSLDataType<UnwrapRecord<TProps>> {
    private _innerSchema;
    private readonly _identifier;
    private readonly _definitionCode;
    readonly byteAlignment: number;
    readonly size: number;
    constructor(properties: TProps);
    alias(debugLabel: string): this;
    resolveReferences(): void;
    write(output: ISerialOutput, value: Parsed<UnwrapRecord<TProps>>): void;
    read(input: ISerialInput): Parsed<UnwrapRecord<TProps>>;
    measure(value: MaxValue | Parsed<UnwrapRecord<TProps>>, measurer?: IMeasurer): IMeasurer;
    resolve(ctx: IResolutionCtx): string;
}
declare const struct: <P extends Record<string, AnyWGSLDataType>>(properties: P) => StructDataType<P>;

declare const arrayOf: <TSchema extends AnyWGSLDataType>(elementType: TSchema, size: number) => SimpleWGSLDataType<TB.ArraySchema<TSchema>>;

declare function ptr<TDataType extends AnyWGSLDataType>(pointsTo: TDataType): WGSLPointerType<'function', TDataType>;

declare function repeat(count: number, snippet: string | WGSLSegment | ((idx: number) => string | WGSLSegment)): WGSLCode;

export { type AsCallable, type ICallable, type IResolutionCtx, MemoryArena, MemoryArenaConflictError, type MemoryLocation, MissingBindingError, NotAllocatedMemoryError, type Program, ProgramBuilder, RandomNameRegistry, RecursiveDataTypeError, SimpleWGSLDataType, StrictNameRegistry, type WGSLBindPair, type WGSLBindableTrait, WGSLCode, WGSLConstant, type WGSLDataType, WGSLFunction$1 as WGSLFunction, WGSLIdentifier, type WGSLItem, WGSLMemory, type WGSLMemoryTrait, type WGSLPointerType, WGSLRequire, WGSLRuntime, type WGSLSegment, WGSLSlot, arrayOf, bool, dynamicArrayOf, f32, i32, isWGSLItem, isWGSLSegment, makeArena, mat4f, ptr, repeat, struct, u32, vec2f, vec2i, vec2u, vec3f, vec3i, vec3u, vec4f, vec4i, vec4u, _default as wgsl };
