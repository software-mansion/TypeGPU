import { $internal, $resolve } from '../shared/symbols.ts';
import type { SelfResolvable } from '../types.ts';
import { bool, f16, f32, i32, u32 } from './numeric.ts';
import { type ResolvedSnippet, snip } from './snippet.ts';
import type { BaseData, VecKind } from './wgslTypes.ts';

type VecSchema<S> = BaseData & ((v?: S) => S);

// deno-fmt-ignore
export abstract class VecBase<S> extends Array implements SelfResolvable {
  abstract readonly [$internal]: {
    elementSchema: VecSchema<S>;
  };
  abstract get kind(): VecKind;

  abstract get _Vec2(): new (
    x: S,
    y: S,
  ) => Vec2<S>;
  abstract get _Vec3(): new (
    x: S,
    y: S,
    z: S,
  ) => Vec3<S>;
  abstract get _Vec4(): new (
    x: S,
    y: S,
    z: S,
    w: S,
  ) => Vec4<S>;

  castElement(): (v?: S) => S {
    return this[$internal].elementSchema;
  }

  [$resolve](): ResolvedSnippet {
    const schema = this[$internal].elementSchema;
    if (this.every((e) => !e)) {
      return snip(`${this.kind}()`, schema, /* origin */ 'constant');
    }
    if (this.every((e) => this[0] === e)) {
      return snip(`${this.kind}(${this[0]})`, schema, /* origin */ 'runtime');
    }
    return snip(`${this.kind}(${this.join(', ')})`, schema, /* origin */ 'runtime');
  }

  toString() {
    return this[$resolve]().value;
  }

  get xx() { return new this._Vec2(this[0], this[0]); }
  get xy() { return new this._Vec2(this[0], this[1]); }
  get xz() { return new this._Vec2(this[0], this[2]); }
  get xw() { return new this._Vec2(this[0], this[3]); }
  get yx() { return new this._Vec2(this[1], this[0]); }
  get yy() { return new this._Vec2(this[1], this[1]); }
  get yz() { return new this._Vec2(this[1], this[2]); }
  get yw() { return new this._Vec2(this[1], this[3]); }
  get zx() { return new this._Vec2(this[2], this[0]); }
  get zy() { return new this._Vec2(this[2], this[1]); }
  get zz() { return new this._Vec2(this[2], this[2]); }
  get zw() { return new this._Vec2(this[2], this[3]); }
  get wx() { return new this._Vec2(this[3], this[0]); }
  get wy() { return new this._Vec2(this[3], this[1]); }
  get wz() { return new this._Vec2(this[3], this[2]); }
  get ww() { return new this._Vec2(this[3], this[3]); }
  get xxx() { return new this._Vec3(this[0], this[0], this[0]); }
  get xxy() { return new this._Vec3(this[0], this[0], this[1]); }
  get xxz() { return new this._Vec3(this[0], this[0], this[2]); }
  get xxw() { return new this._Vec3(this[0], this[0], this[3]); }
  get xyx() { return new this._Vec3(this[0], this[1], this[0]); }
  get xyy() { return new this._Vec3(this[0], this[1], this[1]); }
  get xyz() { return new this._Vec3(this[0], this[1], this[2]); }
  get xyw() { return new this._Vec3(this[0], this[1], this[3]); }
  get xzx() { return new this._Vec3(this[0], this[2], this[0]); }
  get xzy() { return new this._Vec3(this[0], this[2], this[1]); }
  get xzz() { return new this._Vec3(this[0], this[2], this[2]); }
  get xzw() { return new this._Vec3(this[0], this[2], this[3]); }
  get xwx() { return new this._Vec3(this[0], this[3], this[0]); }
  get xwy() { return new this._Vec3(this[0], this[3], this[1]); }
  get xwz() { return new this._Vec3(this[0], this[3], this[2]); }
  get xww() { return new this._Vec3(this[0], this[3], this[3]); }
  get yxx() { return new this._Vec3(this[1], this[0], this[0]); }
  get yxy() { return new this._Vec3(this[1], this[0], this[1]); }
  get yxz() { return new this._Vec3(this[1], this[0], this[2]); }
  get yxw() { return new this._Vec3(this[1], this[0], this[3]); }
  get yyx() { return new this._Vec3(this[1], this[1], this[0]); }
  get yyy() { return new this._Vec3(this[1], this[1], this[1]); }
  get yyz() { return new this._Vec3(this[1], this[1], this[2]); }
  get yyw() { return new this._Vec3(this[1], this[1], this[3]); }
  get yzx() { return new this._Vec3(this[1], this[2], this[0]); }
  get yzy() { return new this._Vec3(this[1], this[2], this[1]); }
  get yzz() { return new this._Vec3(this[1], this[2], this[2]); }
  get yzw() { return new this._Vec3(this[1], this[2], this[3]); }
  get ywx() { return new this._Vec3(this[1], this[3], this[0]); }
  get ywy() { return new this._Vec3(this[1], this[3], this[1]); }
  get ywz() { return new this._Vec3(this[1], this[3], this[2]); }
  get yww() { return new this._Vec3(this[1], this[3], this[3]); }
  get zxx() { return new this._Vec3(this[2], this[0], this[0]); }
  get zxy() { return new this._Vec3(this[2], this[0], this[1]); }
  get zxz() { return new this._Vec3(this[2], this[0], this[2]); }
  get zxw() { return new this._Vec3(this[2], this[0], this[3]); }
  get zyx() { return new this._Vec3(this[2], this[1], this[0]); }
  get zyy() { return new this._Vec3(this[2], this[1], this[1]); }
  get zyz() { return new this._Vec3(this[2], this[1], this[2]); }
  get zyw() { return new this._Vec3(this[2], this[1], this[3]); }
  get zzx() { return new this._Vec3(this[2], this[2], this[0]); }
  get zzy() { return new this._Vec3(this[2], this[2], this[1]); }
  get zzz() { return new this._Vec3(this[2], this[2], this[2]); }
  get zzw() { return new this._Vec3(this[2], this[2], this[3]); }
  get zwx() { return new this._Vec3(this[2], this[3], this[0]); }
  get zwy() { return new this._Vec3(this[2], this[3], this[1]); }
  get zwz() { return new this._Vec3(this[2], this[3], this[2]); }
  get zww() { return new this._Vec3(this[2], this[3], this[3]); }
  get wxx() { return new this._Vec3(this[3], this[0], this[0]); }
  get wxy() { return new this._Vec3(this[3], this[0], this[1]); }
  get wxz() { return new this._Vec3(this[3], this[0], this[2]); }
  get wxw() { return new this._Vec3(this[3], this[0], this[3]); }
  get wyx() { return new this._Vec3(this[3], this[1], this[0]); }
  get wyy() { return new this._Vec3(this[3], this[1], this[1]); }
  get wyz() { return new this._Vec3(this[3], this[1], this[2]); }
  get wyw() { return new this._Vec3(this[3], this[1], this[3]); }
  get wzx() { return new this._Vec3(this[3], this[2], this[0]); }
  get wzy() { return new this._Vec3(this[3], this[2], this[1]); }
  get wzz() { return new this._Vec3(this[3], this[2], this[2]); }
  get wzw() { return new this._Vec3(this[3], this[2], this[3]); }
  get wwx() { return new this._Vec3(this[3], this[3], this[0]); }
  get wwy() { return new this._Vec3(this[3], this[3], this[1]); }
  get wwz() { return new this._Vec3(this[3], this[3], this[2]); }
  get www() { return new this._Vec3(this[3], this[3], this[3]); }
  get xxxx() { return new this._Vec4(this[0], this[0], this[0], this[0]); }
  get xxxy() { return new this._Vec4(this[0], this[0], this[0], this[1]); }
  get xxxz() { return new this._Vec4(this[0], this[0], this[0], this[2]); }
  get xxxw() { return new this._Vec4(this[0], this[0], this[0], this[3]); }
  get xxyx() { return new this._Vec4(this[0], this[0], this[1], this[0]); }
  get xxyy() { return new this._Vec4(this[0], this[0], this[1], this[1]); }
  get xxyz() { return new this._Vec4(this[0], this[0], this[1], this[2]); }
  get xxyw() { return new this._Vec4(this[0], this[0], this[1], this[3]); }
  get xxzx() { return new this._Vec4(this[0], this[0], this[2], this[0]); }
  get xxzy() { return new this._Vec4(this[0], this[0], this[2], this[1]); }
  get xxzz() { return new this._Vec4(this[0], this[0], this[2], this[2]); }
  get xxzw() { return new this._Vec4(this[0], this[0], this[2], this[3]); }
  get xxwx() { return new this._Vec4(this[0], this[0], this[3], this[0]); }
  get xxwy() { return new this._Vec4(this[0], this[0], this[3], this[1]); }
  get xxwz() { return new this._Vec4(this[0], this[0], this[3], this[2]); }
  get xxww() { return new this._Vec4(this[0], this[0], this[3], this[3]); }
  get xyxx() { return new this._Vec4(this[0], this[1], this[0], this[0]); }
  get xyxy() { return new this._Vec4(this[0], this[1], this[0], this[1]); }
  get xyxz() { return new this._Vec4(this[0], this[1], this[0], this[2]); }
  get xyxw() { return new this._Vec4(this[0], this[1], this[0], this[3]); }
  get xyyx() { return new this._Vec4(this[0], this[1], this[1], this[0]); }
  get xyyy() { return new this._Vec4(this[0], this[1], this[1], this[1]); }
  get xyyz() { return new this._Vec4(this[0], this[1], this[1], this[2]); }
  get xyyw() { return new this._Vec4(this[0], this[1], this[1], this[3]); }
  get xyzx() { return new this._Vec4(this[0], this[1], this[2], this[0]); }
  get xyzy() { return new this._Vec4(this[0], this[1], this[2], this[1]); }
  get xyzz() { return new this._Vec4(this[0], this[1], this[2], this[2]); }
  get xyzw() { return new this._Vec4(this[0], this[1], this[2], this[3]); }
  get xywx() { return new this._Vec4(this[0], this[1], this[3], this[0]); }
  get xywy() { return new this._Vec4(this[0], this[1], this[3], this[1]); }
  get xywz() { return new this._Vec4(this[0], this[1], this[3], this[2]); }
  get xyww() { return new this._Vec4(this[0], this[1], this[3], this[3]); }
  get xzxx() { return new this._Vec4(this[0], this[2], this[0], this[0]); }
  get xzxy() { return new this._Vec4(this[0], this[2], this[0], this[1]); }
  get xzxz() { return new this._Vec4(this[0], this[2], this[0], this[2]); }
  get xzxw() { return new this._Vec4(this[0], this[2], this[0], this[3]); }
  get xzyx() { return new this._Vec4(this[0], this[2], this[1], this[0]); }
  get xzyy() { return new this._Vec4(this[0], this[2], this[1], this[1]); }
  get xzyz() { return new this._Vec4(this[0], this[2], this[1], this[2]); }
  get xzyw() { return new this._Vec4(this[0], this[2], this[1], this[3]); }
  get xzzx() { return new this._Vec4(this[0], this[2], this[2], this[0]); }
  get xzzy() { return new this._Vec4(this[0], this[2], this[2], this[1]); }
  get xzzz() { return new this._Vec4(this[0], this[2], this[2], this[2]); }
  get xzzw() { return new this._Vec4(this[0], this[2], this[2], this[3]); }
  get xzwx() { return new this._Vec4(this[0], this[2], this[3], this[0]); }
  get xzwy() { return new this._Vec4(this[0], this[2], this[3], this[1]); }
  get xzwz() { return new this._Vec4(this[0], this[2], this[3], this[2]); }
  get xzww() { return new this._Vec4(this[0], this[2], this[3], this[3]); }
  get xwxx() { return new this._Vec4(this[0], this[3], this[0], this[0]); }
  get xwxy() { return new this._Vec4(this[0], this[3], this[0], this[1]); }
  get xwxz() { return new this._Vec4(this[0], this[3], this[0], this[2]); }
  get xwxw() { return new this._Vec4(this[0], this[3], this[0], this[3]); }
  get xwyx() { return new this._Vec4(this[0], this[3], this[1], this[0]); }
  get xwyy() { return new this._Vec4(this[0], this[3], this[1], this[1]); }
  get xwyz() { return new this._Vec4(this[0], this[3], this[1], this[2]); }
  get xwyw() { return new this._Vec4(this[0], this[3], this[1], this[3]); }
  get xwzx() { return new this._Vec4(this[0], this[3], this[2], this[0]); }
  get xwzy() { return new this._Vec4(this[0], this[3], this[2], this[1]); }
  get xwzz() { return new this._Vec4(this[0], this[3], this[2], this[2]); }
  get xwzw() { return new this._Vec4(this[0], this[3], this[2], this[3]); }
  get xwwx() { return new this._Vec4(this[0], this[3], this[3], this[0]); }
  get xwwy() { return new this._Vec4(this[0], this[3], this[3], this[1]); }
  get xwwz() { return new this._Vec4(this[0], this[3], this[3], this[2]); }
  get xwww() { return new this._Vec4(this[0], this[3], this[3], this[3]); }
  get yxxx() { return new this._Vec4(this[1], this[0], this[0], this[0]); }
  get yxxy() { return new this._Vec4(this[1], this[0], this[0], this[1]); }
  get yxxz() { return new this._Vec4(this[1], this[0], this[0], this[2]); }
  get yxxw() { return new this._Vec4(this[1], this[0], this[0], this[3]); }
  get yxyx() { return new this._Vec4(this[1], this[0], this[1], this[0]); }
  get yxyy() { return new this._Vec4(this[1], this[0], this[1], this[1]); }
  get yxyz() { return new this._Vec4(this[1], this[0], this[1], this[2]); }
  get yxyw() { return new this._Vec4(this[1], this[0], this[1], this[3]); }
  get yxzx() { return new this._Vec4(this[1], this[0], this[2], this[0]); }
  get yxzy() { return new this._Vec4(this[1], this[0], this[2], this[1]); }
  get yxzz() { return new this._Vec4(this[1], this[0], this[2], this[2]); }
  get yxzw() { return new this._Vec4(this[1], this[0], this[2], this[3]); }
  get yxwx() { return new this._Vec4(this[1], this[0], this[3], this[0]); }
  get yxwy() { return new this._Vec4(this[1], this[0], this[3], this[1]); }
  get yxwz() { return new this._Vec4(this[1], this[0], this[3], this[2]); }
  get yxww() { return new this._Vec4(this[1], this[0], this[3], this[3]); }
  get yyxx() { return new this._Vec4(this[1], this[1], this[0], this[0]); }
  get yyxy() { return new this._Vec4(this[1], this[1], this[0], this[1]); }
  get yyxz() { return new this._Vec4(this[1], this[1], this[0], this[2]); }
  get yyxw() { return new this._Vec4(this[1], this[1], this[0], this[3]); }
  get yyyx() { return new this._Vec4(this[1], this[1], this[1], this[0]); }
  get yyyy() { return new this._Vec4(this[1], this[1], this[1], this[1]); }
  get yyyz() { return new this._Vec4(this[1], this[1], this[1], this[2]); }
  get yyyw() { return new this._Vec4(this[1], this[1], this[1], this[3]); }
  get yyzx() { return new this._Vec4(this[1], this[1], this[2], this[0]); }
  get yyzy() { return new this._Vec4(this[1], this[1], this[2], this[1]); }
  get yyzz() { return new this._Vec4(this[1], this[1], this[2], this[2]); }
  get yyzw() { return new this._Vec4(this[1], this[1], this[2], this[3]); }
  get yywx() { return new this._Vec4(this[1], this[1], this[3], this[0]); }
  get yywy() { return new this._Vec4(this[1], this[1], this[3], this[1]); }
  get yywz() { return new this._Vec4(this[1], this[1], this[3], this[2]); }
  get yyww() { return new this._Vec4(this[1], this[1], this[3], this[3]); }
  get yzxx() { return new this._Vec4(this[1], this[2], this[0], this[0]); }
  get yzxy() { return new this._Vec4(this[1], this[2], this[0], this[1]); }
  get yzxz() { return new this._Vec4(this[1], this[2], this[0], this[2]); }
  get yzxw() { return new this._Vec4(this[1], this[2], this[0], this[3]); }
  get yzyx() { return new this._Vec4(this[1], this[2], this[1], this[0]); }
  get yzyy() { return new this._Vec4(this[1], this[2], this[1], this[1]); }
  get yzyz() { return new this._Vec4(this[1], this[2], this[1], this[2]); }
  get yzyw() { return new this._Vec4(this[1], this[2], this[1], this[3]); }
  get yzzx() { return new this._Vec4(this[1], this[2], this[2], this[0]); }
  get yzzy() { return new this._Vec4(this[1], this[2], this[2], this[1]); }
  get yzzz() { return new this._Vec4(this[1], this[2], this[2], this[2]); }
  get yzzw() { return new this._Vec4(this[1], this[2], this[2], this[3]); }
  get yzwx() { return new this._Vec4(this[1], this[2], this[3], this[0]); }
  get yzwy() { return new this._Vec4(this[1], this[2], this[3], this[1]); }
  get yzwz() { return new this._Vec4(this[1], this[2], this[3], this[2]); }
  get yzww() { return new this._Vec4(this[1], this[2], this[3], this[3]); }
  get ywxx() { return new this._Vec4(this[1], this[3], this[0], this[0]); }
  get ywxy() { return new this._Vec4(this[1], this[3], this[0], this[1]); }
  get ywxz() { return new this._Vec4(this[1], this[3], this[0], this[2]); }
  get ywxw() { return new this._Vec4(this[1], this[3], this[0], this[3]); }
  get ywyx() { return new this._Vec4(this[1], this[3], this[1], this[0]); }
  get ywyy() { return new this._Vec4(this[1], this[3], this[1], this[1]); }
  get ywyz() { return new this._Vec4(this[1], this[3], this[1], this[2]); }
  get ywyw() { return new this._Vec4(this[1], this[3], this[1], this[3]); }
  get ywzx() { return new this._Vec4(this[1], this[3], this[2], this[0]); }
  get ywzy() { return new this._Vec4(this[1], this[3], this[2], this[1]); }
  get ywzz() { return new this._Vec4(this[1], this[3], this[2], this[2]); }
  get ywzw() { return new this._Vec4(this[1], this[3], this[2], this[3]); }
  get ywwx() { return new this._Vec4(this[1], this[3], this[3], this[0]); }
  get ywwy() { return new this._Vec4(this[1], this[3], this[3], this[1]); }
  get ywwz() { return new this._Vec4(this[1], this[3], this[3], this[2]); }
  get ywww() { return new this._Vec4(this[1], this[3], this[3], this[3]); }
  get zxxx() { return new this._Vec4(this[2], this[0], this[0], this[0]); }
  get zxxy() { return new this._Vec4(this[2], this[0], this[0], this[1]); }
  get zxxz() { return new this._Vec4(this[2], this[0], this[0], this[2]); }
  get zxxw() { return new this._Vec4(this[2], this[0], this[0], this[3]); }
  get zxyx() { return new this._Vec4(this[2], this[0], this[1], this[0]); }
  get zxyy() { return new this._Vec4(this[2], this[0], this[1], this[1]); }
  get zxyz() { return new this._Vec4(this[2], this[0], this[1], this[2]); }
  get zxyw() { return new this._Vec4(this[2], this[0], this[1], this[3]); }
  get zxzx() { return new this._Vec4(this[2], this[0], this[2], this[0]); }
  get zxzy() { return new this._Vec4(this[2], this[0], this[2], this[1]); }
  get zxzz() { return new this._Vec4(this[2], this[0], this[2], this[2]); }
  get zxzw() { return new this._Vec4(this[2], this[0], this[2], this[3]); }
  get zxwx() { return new this._Vec4(this[2], this[0], this[3], this[0]); }
  get zxwy() { return new this._Vec4(this[2], this[0], this[3], this[1]); }
  get zxwz() { return new this._Vec4(this[2], this[0], this[3], this[2]); }
  get zxww() { return new this._Vec4(this[2], this[0], this[3], this[3]); }
  get zyxx() { return new this._Vec4(this[2], this[1], this[0], this[0]); }
  get zyxy() { return new this._Vec4(this[2], this[1], this[0], this[1]); }
  get zyxz() { return new this._Vec4(this[2], this[1], this[0], this[2]); }
  get zyxw() { return new this._Vec4(this[2], this[1], this[0], this[3]); }
  get zyyx() { return new this._Vec4(this[2], this[1], this[1], this[0]); }
  get zyyy() { return new this._Vec4(this[2], this[1], this[1], this[1]); }
  get zyyz() { return new this._Vec4(this[2], this[1], this[1], this[2]); }
  get zyyw() { return new this._Vec4(this[2], this[1], this[1], this[3]); }
  get zyzx() { return new this._Vec4(this[2], this[1], this[2], this[0]); }
  get zyzy() { return new this._Vec4(this[2], this[1], this[2], this[1]); }
  get zyzz() { return new this._Vec4(this[2], this[1], this[2], this[2]); }
  get zyzw() { return new this._Vec4(this[2], this[1], this[2], this[3]); }
  get zywx() { return new this._Vec4(this[2], this[1], this[3], this[0]); }
  get zywy() { return new this._Vec4(this[2], this[1], this[3], this[1]); }
  get zywz() { return new this._Vec4(this[2], this[1], this[3], this[2]); }
  get zyww() { return new this._Vec4(this[2], this[1], this[3], this[3]); }
  get zzxx() { return new this._Vec4(this[2], this[2], this[0], this[0]); }
  get zzxy() { return new this._Vec4(this[2], this[2], this[0], this[1]); }
  get zzxz() { return new this._Vec4(this[2], this[2], this[0], this[2]); }
  get zzxw() { return new this._Vec4(this[2], this[2], this[0], this[3]); }
  get zzyx() { return new this._Vec4(this[2], this[2], this[1], this[0]); }
  get zzyy() { return new this._Vec4(this[2], this[2], this[1], this[1]); }
  get zzyz() { return new this._Vec4(this[2], this[2], this[1], this[2]); }
  get zzyw() { return new this._Vec4(this[2], this[2], this[1], this[3]); }
  get zzzx() { return new this._Vec4(this[2], this[2], this[2], this[0]); }
  get zzzy() { return new this._Vec4(this[2], this[2], this[2], this[1]); }
  get zzzz() { return new this._Vec4(this[2], this[2], this[2], this[2]); }
  get zzzw() { return new this._Vec4(this[2], this[2], this[2], this[3]); }
  get zzwx() { return new this._Vec4(this[2], this[2], this[3], this[0]); }
  get zzwy() { return new this._Vec4(this[2], this[2], this[3], this[1]); }
  get zzwz() { return new this._Vec4(this[2], this[2], this[3], this[2]); }
  get zzww() { return new this._Vec4(this[2], this[2], this[3], this[3]); }
  get zwxx() { return new this._Vec4(this[2], this[3], this[0], this[0]); }
  get zwxy() { return new this._Vec4(this[2], this[3], this[0], this[1]); }
  get zwxz() { return new this._Vec4(this[2], this[3], this[0], this[2]); }
  get zwxw() { return new this._Vec4(this[2], this[3], this[0], this[3]); }
  get zwyx() { return new this._Vec4(this[2], this[3], this[1], this[0]); }
  get zwyy() { return new this._Vec4(this[2], this[3], this[1], this[1]); }
  get zwyz() { return new this._Vec4(this[2], this[3], this[1], this[2]); }
  get zwyw() { return new this._Vec4(this[2], this[3], this[1], this[3]); }
  get zwzx() { return new this._Vec4(this[2], this[3], this[2], this[0]); }
  get zwzy() { return new this._Vec4(this[2], this[3], this[2], this[1]); }
  get zwzz() { return new this._Vec4(this[2], this[3], this[2], this[2]); }
  get zwzw() { return new this._Vec4(this[2], this[3], this[2], this[3]); }
  get zwwx() { return new this._Vec4(this[2], this[3], this[3], this[0]); }
  get zwwy() { return new this._Vec4(this[2], this[3], this[3], this[1]); }
  get zwwz() { return new this._Vec4(this[2], this[3], this[3], this[2]); }
  get zwww() { return new this._Vec4(this[2], this[3], this[3], this[3]); }
  get wxxx() { return new this._Vec4(this[3], this[0], this[0], this[0]); }
  get wxxy() { return new this._Vec4(this[3], this[0], this[0], this[1]); }
  get wxxz() { return new this._Vec4(this[3], this[0], this[0], this[2]); }
  get wxxw() { return new this._Vec4(this[3], this[0], this[0], this[3]); }
  get wxyx() { return new this._Vec4(this[3], this[0], this[1], this[0]); }
  get wxyy() { return new this._Vec4(this[3], this[0], this[1], this[1]); }
  get wxyz() { return new this._Vec4(this[3], this[0], this[1], this[2]); }
  get wxyw() { return new this._Vec4(this[3], this[0], this[1], this[3]); }
  get wxzx() { return new this._Vec4(this[3], this[0], this[2], this[0]); }
  get wxzy() { return new this._Vec4(this[3], this[0], this[2], this[1]); }
  get wxzz() { return new this._Vec4(this[3], this[0], this[2], this[2]); }
  get wxzw() { return new this._Vec4(this[3], this[0], this[2], this[3]); }
  get wxwx() { return new this._Vec4(this[3], this[0], this[3], this[0]); }
  get wxwy() { return new this._Vec4(this[3], this[0], this[3], this[1]); }
  get wxwz() { return new this._Vec4(this[3], this[0], this[3], this[2]); }
  get wxww() { return new this._Vec4(this[3], this[0], this[3], this[3]); }
  get wyxx() { return new this._Vec4(this[3], this[1], this[0], this[0]); }
  get wyxy() { return new this._Vec4(this[3], this[1], this[0], this[1]); }
  get wyxz() { return new this._Vec4(this[3], this[1], this[0], this[2]); }
  get wyxw() { return new this._Vec4(this[3], this[1], this[0], this[3]); }
  get wyyx() { return new this._Vec4(this[3], this[1], this[1], this[0]); }
  get wyyy() { return new this._Vec4(this[3], this[1], this[1], this[1]); }
  get wyyz() { return new this._Vec4(this[3], this[1], this[1], this[2]); }
  get wyyw() { return new this._Vec4(this[3], this[1], this[1], this[3]); }
  get wyzx() { return new this._Vec4(this[3], this[1], this[2], this[0]); }
  get wyzy() { return new this._Vec4(this[3], this[1], this[2], this[1]); }
  get wyzz() { return new this._Vec4(this[3], this[1], this[2], this[2]); }
  get wyzw() { return new this._Vec4(this[3], this[1], this[2], this[3]); }
  get wywx() { return new this._Vec4(this[3], this[1], this[3], this[0]); }
  get wywy() { return new this._Vec4(this[3], this[1], this[3], this[1]); }
  get wywz() { return new this._Vec4(this[3], this[1], this[3], this[2]); }
  get wyww() { return new this._Vec4(this[3], this[1], this[3], this[3]); }
  get wzxx() { return new this._Vec4(this[3], this[2], this[0], this[0]); }
  get wzxy() { return new this._Vec4(this[3], this[2], this[0], this[1]); }
  get wzxz() { return new this._Vec4(this[3], this[2], this[0], this[2]); }
  get wzxw() { return new this._Vec4(this[3], this[2], this[0], this[3]); }
  get wzyx() { return new this._Vec4(this[3], this[2], this[1], this[0]); }
  get wzyy() { return new this._Vec4(this[3], this[2], this[1], this[1]); }
  get wzyz() { return new this._Vec4(this[3], this[2], this[1], this[2]); }
  get wzyw() { return new this._Vec4(this[3], this[2], this[1], this[3]); }
  get wzzx() { return new this._Vec4(this[3], this[2], this[2], this[0]); }
  get wzzy() { return new this._Vec4(this[3], this[2], this[2], this[1]); }
  get wzzz() { return new this._Vec4(this[3], this[2], this[2], this[2]); }
  get wzzw() { return new this._Vec4(this[3], this[2], this[2], this[3]); }
  get wzwx() { return new this._Vec4(this[3], this[2], this[3], this[0]); }
  get wzwy() { return new this._Vec4(this[3], this[2], this[3], this[1]); }
  get wzwz() { return new this._Vec4(this[3], this[2], this[3], this[2]); }
  get wzww() { return new this._Vec4(this[3], this[2], this[3], this[3]); }
  get wwxx() { return new this._Vec4(this[3], this[3], this[0], this[0]); }
  get wwxy() { return new this._Vec4(this[3], this[3], this[0], this[1]); }
  get wwxz() { return new this._Vec4(this[3], this[3], this[0], this[2]); }
  get wwxw() { return new this._Vec4(this[3], this[3], this[0], this[3]); }
  get wwyx() { return new this._Vec4(this[3], this[3], this[1], this[0]); }
  get wwyy() { return new this._Vec4(this[3], this[3], this[1], this[1]); }
  get wwyz() { return new this._Vec4(this[3], this[3], this[1], this[2]); }
  get wwyw() { return new this._Vec4(this[3], this[3], this[1], this[3]); }
  get wwzx() { return new this._Vec4(this[3], this[3], this[2], this[0]); }
  get wwzy() { return new this._Vec4(this[3], this[3], this[2], this[1]); }
  get wwzz() { return new this._Vec4(this[3], this[3], this[2], this[2]); }
  get wwzw() { return new this._Vec4(this[3], this[3], this[2], this[3]); }
  get wwwx() { return new this._Vec4(this[3], this[3], this[3], this[0]); }
  get wwwy() { return new this._Vec4(this[3], this[3], this[3], this[1]); }
  get wwwz() { return new this._Vec4(this[3], this[3], this[3], this[2]); }
  get wwww() { return new this._Vec4(this[3], this[3], this[3], this[3]); }

  // RGBA swizzles (length 2)
  get rr() { return new this._Vec2(this[0], this[0]); }
  get rg() { return new this._Vec2(this[0], this[1]); }
  get rb() { return new this._Vec2(this[0], this[2]); }
  get ra() { return new this._Vec2(this[0], this[3]); }
  get gr() { return new this._Vec2(this[1], this[0]); }
  get gg() { return new this._Vec2(this[1], this[1]); }
  get gb() { return new this._Vec2(this[1], this[2]); }
  get ga() { return new this._Vec2(this[1], this[3]); }
  get br() { return new this._Vec2(this[2], this[0]); }
  get bg() { return new this._Vec2(this[2], this[1]); }
  get bb() { return new this._Vec2(this[2], this[2]); }
  get ba() { return new this._Vec2(this[2], this[3]); }
  get ar() { return new this._Vec2(this[3], this[0]); }
  get ag() { return new this._Vec2(this[3], this[1]); }
  get ab() { return new this._Vec2(this[3], this[2]); }
  get aa() { return new this._Vec2(this[3], this[3]); }

  // RGBA swizzles (length 3)
  get rrr() { return new this._Vec3(this[0], this[0], this[0]); }
  get rrg() { return new this._Vec3(this[0], this[0], this[1]); }
  get rrb() { return new this._Vec3(this[0], this[0], this[2]); }
  get rra() { return new this._Vec3(this[0], this[0], this[3]); }
  get rgr() { return new this._Vec3(this[0], this[1], this[0]); }
  get rgg() { return new this._Vec3(this[0], this[1], this[1]); }
  get rgb() { return new this._Vec3(this[0], this[1], this[2]); }
  get rga() { return new this._Vec3(this[0], this[1], this[3]); }
  get rbr() { return new this._Vec3(this[0], this[2], this[0]); }
  get rbg() { return new this._Vec3(this[0], this[2], this[1]); }
  get rbb() { return new this._Vec3(this[0], this[2], this[2]); }
  get rba() { return new this._Vec3(this[0], this[2], this[3]); }
  get rar() { return new this._Vec3(this[0], this[3], this[0]); }
  get rag() { return new this._Vec3(this[0], this[3], this[1]); }
  get rab() { return new this._Vec3(this[0], this[3], this[2]); }
  get raa() { return new this._Vec3(this[0], this[3], this[3]); }
  get grr() { return new this._Vec3(this[1], this[0], this[0]); }
  get grg() { return new this._Vec3(this[1], this[0], this[1]); }
  get grb() { return new this._Vec3(this[1], this[0], this[2]); }
  get gra() { return new this._Vec3(this[1], this[0], this[3]); }
  get ggr() { return new this._Vec3(this[1], this[1], this[0]); }
  get ggg() { return new this._Vec3(this[1], this[1], this[1]); }
  get ggb() { return new this._Vec3(this[1], this[1], this[2]); }
  get gga() { return new this._Vec3(this[1], this[1], this[3]); }
  get gbr() { return new this._Vec3(this[1], this[2], this[0]); }
  get gbg() { return new this._Vec3(this[1], this[2], this[1]); }
  get gbb() { return new this._Vec3(this[1], this[2], this[2]); }
  get gba() { return new this._Vec3(this[1], this[2], this[3]); }
  get gar() { return new this._Vec3(this[1], this[3], this[0]); }
  get gag() { return new this._Vec3(this[1], this[3], this[1]); }
  get gab() { return new this._Vec3(this[1], this[3], this[2]); }
  get gaa() { return new this._Vec3(this[1], this[3], this[3]); }
  get brr() { return new this._Vec3(this[2], this[0], this[0]); }
  get brg() { return new this._Vec3(this[2], this[0], this[1]); }
  get brb() { return new this._Vec3(this[2], this[0], this[2]); }
  get bra() { return new this._Vec3(this[2], this[0], this[3]); }
  get bgr() { return new this._Vec3(this[2], this[1], this[0]); }
  get bgg() { return new this._Vec3(this[2], this[1], this[1]); }
  get bgb() { return new this._Vec3(this[2], this[1], this[2]); }
  get bga() { return new this._Vec3(this[2], this[1], this[3]); }
  get bbr() { return new this._Vec3(this[2], this[2], this[0]); }
  get bbg() { return new this._Vec3(this[2], this[2], this[1]); }
  get bbb() { return new this._Vec3(this[2], this[2], this[2]); }
  get bba() { return new this._Vec3(this[2], this[2], this[3]); }
  get bar() { return new this._Vec3(this[2], this[3], this[0]); }
  get bag() { return new this._Vec3(this[2], this[3], this[1]); }
  get bab() { return new this._Vec3(this[2], this[3], this[2]); }
  get baa() { return new this._Vec3(this[2], this[3], this[3]); }
  get arr() { return new this._Vec3(this[3], this[0], this[0]); }
  get arg() { return new this._Vec3(this[3], this[0], this[1]); }
  get arb() { return new this._Vec3(this[3], this[0], this[2]); }
  get ara() { return new this._Vec3(this[3], this[0], this[3]); }
  get agr() { return new this._Vec3(this[3], this[1], this[0]); }
  get agg() { return new this._Vec3(this[3], this[1], this[1]); }
  get agb() { return new this._Vec3(this[3], this[1], this[2]); }
  get aga() { return new this._Vec3(this[3], this[1], this[3]); }
  get abr() { return new this._Vec3(this[3], this[2], this[0]); }
  get abg() { return new this._Vec3(this[3], this[2], this[1]); }
  get abb() { return new this._Vec3(this[3], this[2], this[2]); }
  get aba() { return new this._Vec3(this[3], this[2], this[3]); }
  get aar() { return new this._Vec3(this[3], this[3], this[0]); }
  get aag() { return new this._Vec3(this[3], this[3], this[1]); }
  get aab() { return new this._Vec3(this[3], this[3], this[2]); }
  get aaa() { return new this._Vec3(this[3], this[3], this[3]); }

  // RGBA swizzles (length 4)
  get rrrr() { return new this._Vec4(this[0], this[0], this[0], this[0]); }
  get rrrg() { return new this._Vec4(this[0], this[0], this[0], this[1]); }
  get rrrb() { return new this._Vec4(this[0], this[0], this[0], this[2]); }
  get rrra() { return new this._Vec4(this[0], this[0], this[0], this[3]); }
  get rrgr() { return new this._Vec4(this[0], this[0], this[1], this[0]); }
  get rrgg() { return new this._Vec4(this[0], this[0], this[1], this[1]); }
  get rrgb() { return new this._Vec4(this[0], this[0], this[1], this[2]); }
  get rrga() { return new this._Vec4(this[0], this[0], this[1], this[3]); }
  get rrbr() { return new this._Vec4(this[0], this[0], this[2], this[0]); }
  get rrbg() { return new this._Vec4(this[0], this[0], this[2], this[1]); }
  get rrbb() { return new this._Vec4(this[0], this[0], this[2], this[2]); }
  get rrba() { return new this._Vec4(this[0], this[0], this[2], this[3]); }
  get rrar() { return new this._Vec4(this[0], this[0], this[3], this[0]); }
  get rrag() { return new this._Vec4(this[0], this[0], this[3], this[1]); }
  get rrab() { return new this._Vec4(this[0], this[0], this[3], this[2]); }
  get rraa() { return new this._Vec4(this[0], this[0], this[3], this[3]); }
  get rgrr() { return new this._Vec4(this[0], this[1], this[0], this[0]); }
  get rgrg() { return new this._Vec4(this[0], this[1], this[0], this[1]); }
  get rgrb() { return new this._Vec4(this[0], this[1], this[0], this[2]); }
  get rgra() { return new this._Vec4(this[0], this[1], this[0], this[3]); }
  get rggr() { return new this._Vec4(this[0], this[1], this[1], this[0]); }
  get rggg() { return new this._Vec4(this[0], this[1], this[1], this[1]); }
  get rggb() { return new this._Vec4(this[0], this[1], this[1], this[2]); }
  get rgga() { return new this._Vec4(this[0], this[1], this[1], this[3]); }
  get rgbr() { return new this._Vec4(this[0], this[1], this[2], this[0]); }
  get rgbg() { return new this._Vec4(this[0], this[1], this[2], this[1]); }
  get rgbb() { return new this._Vec4(this[0], this[1], this[2], this[2]); }
  get rgba() { return new this._Vec4(this[0], this[1], this[2], this[3]); }
  get rgar() { return new this._Vec4(this[0], this[1], this[3], this[0]); }
  get rgag() { return new this._Vec4(this[0], this[1], this[3], this[1]); }
  get rgab() { return new this._Vec4(this[0], this[1], this[3], this[2]); }
  get rgaa() { return new this._Vec4(this[0], this[1], this[3], this[3]); }
  get rbrr() { return new this._Vec4(this[0], this[2], this[0], this[0]); }
  get rbrg() { return new this._Vec4(this[0], this[2], this[0], this[1]); }
  get rbrb() { return new this._Vec4(this[0], this[2], this[0], this[2]); }
  get rbra() { return new this._Vec4(this[0], this[2], this[0], this[3]); }
  get rbgr() { return new this._Vec4(this[0], this[2], this[1], this[0]); }
  get rbgg() { return new this._Vec4(this[0], this[2], this[1], this[1]); }
  get rbgb() { return new this._Vec4(this[0], this[2], this[1], this[2]); }
  get rbga() { return new this._Vec4(this[0], this[2], this[1], this[3]); }
  get rbbr() { return new this._Vec4(this[0], this[2], this[2], this[0]); }
  get rbbg() { return new this._Vec4(this[0], this[2], this[2], this[1]); }
  get rbbb() { return new this._Vec4(this[0], this[2], this[2], this[2]); }
  get rbba() { return new this._Vec4(this[0], this[2], this[2], this[3]); }
  get rbar() { return new this._Vec4(this[0], this[2], this[3], this[0]); }
  get rbag() { return new this._Vec4(this[0], this[2], this[3], this[1]); }
  get rbab() { return new this._Vec4(this[0], this[2], this[3], this[2]); }
  get rbaa() { return new this._Vec4(this[0], this[2], this[3], this[3]); }
  get rarr() { return new this._Vec4(this[0], this[3], this[0], this[0]); }
  get rarg() { return new this._Vec4(this[0], this[3], this[0], this[1]); }
  get rarb() { return new this._Vec4(this[0], this[3], this[0], this[2]); }
  get rara() { return new this._Vec4(this[0], this[3], this[0], this[3]); }
  get ragr() { return new this._Vec4(this[0], this[3], this[1], this[0]); }
  get ragg() { return new this._Vec4(this[0], this[3], this[1], this[1]); }
  get ragb() { return new this._Vec4(this[0], this[3], this[1], this[2]); }
  get raga() { return new this._Vec4(this[0], this[3], this[1], this[3]); }
  get rabr() { return new this._Vec4(this[0], this[3], this[2], this[0]); }
  get rabg() { return new this._Vec4(this[0], this[3], this[2], this[1]); }
  get rabb() { return new this._Vec4(this[0], this[3], this[2], this[2]); }
  get raba() { return new this._Vec4(this[0], this[3], this[2], this[3]); }
  get raar() { return new this._Vec4(this[0], this[3], this[3], this[0]); }
  get raag() { return new this._Vec4(this[0], this[3], this[3], this[1]); }
  get raab() { return new this._Vec4(this[0], this[3], this[3], this[2]); }
  get raaa() { return new this._Vec4(this[0], this[3], this[3], this[3]); }
  get grrr() { return new this._Vec4(this[1], this[0], this[0], this[0]); }
  get grrg() { return new this._Vec4(this[1], this[0], this[0], this[1]); }
  get grrb() { return new this._Vec4(this[1], this[0], this[0], this[2]); }
  get grra() { return new this._Vec4(this[1], this[0], this[0], this[3]); }
  get grgr() { return new this._Vec4(this[1], this[0], this[1], this[0]); }
  get grgg() { return new this._Vec4(this[1], this[0], this[1], this[1]); }
  get grgb() { return new this._Vec4(this[1], this[0], this[1], this[2]); }
  get grga() { return new this._Vec4(this[1], this[0], this[1], this[3]); }
  get grbr() { return new this._Vec4(this[1], this[0], this[2], this[0]); }
  get grbg() { return new this._Vec4(this[1], this[0], this[2], this[1]); }
  get grbb() { return new this._Vec4(this[1], this[0], this[2], this[2]); }
  get grba() { return new this._Vec4(this[1], this[0], this[2], this[3]); }
  get grar() { return new this._Vec4(this[1], this[0], this[3], this[0]); }
  get grag() { return new this._Vec4(this[1], this[0], this[3], this[1]); }
  get grab() { return new this._Vec4(this[1], this[0], this[3], this[2]); }
  get graa() { return new this._Vec4(this[1], this[0], this[3], this[3]); }
  get ggrr() { return new this._Vec4(this[1], this[1], this[0], this[0]); }
  get ggrg() { return new this._Vec4(this[1], this[1], this[0], this[1]); }
  get ggrb() { return new this._Vec4(this[1], this[1], this[0], this[2]); }
  get ggra() { return new this._Vec4(this[1], this[1], this[0], this[3]); }
  get gggr() { return new this._Vec4(this[1], this[1], this[1], this[0]); }
  get gggg() { return new this._Vec4(this[1], this[1], this[1], this[1]); }
  get gggb() { return new this._Vec4(this[1], this[1], this[1], this[2]); }
  get ggga() { return new this._Vec4(this[1], this[1], this[1], this[3]); }
  get ggbr() { return new this._Vec4(this[1], this[1], this[2], this[0]); }
  get ggbg() { return new this._Vec4(this[1], this[1], this[2], this[1]); }
  get ggbb() { return new this._Vec4(this[1], this[1], this[2], this[2]); }
  get ggba() { return new this._Vec4(this[1], this[1], this[2], this[3]); }
  get ggar() { return new this._Vec4(this[1], this[1], this[3], this[0]); }
  get ggag() { return new this._Vec4(this[1], this[1], this[3], this[1]); }
  get ggab() { return new this._Vec4(this[1], this[1], this[3], this[2]); }
  get ggaa() { return new this._Vec4(this[1], this[1], this[3], this[3]); }
  get gbrr() { return new this._Vec4(this[1], this[2], this[0], this[0]); }
  get gbrg() { return new this._Vec4(this[1], this[2], this[0], this[1]); }
  get gbrb() { return new this._Vec4(this[1], this[2], this[0], this[2]); }
  get gbra() { return new this._Vec4(this[1], this[2], this[0], this[3]); }
  get gbgr() { return new this._Vec4(this[1], this[2], this[1], this[0]); }
  get gbgg() { return new this._Vec4(this[1], this[2], this[1], this[1]); }
  get gbgb() { return new this._Vec4(this[1], this[2], this[1], this[2]); }
  get gbga() { return new this._Vec4(this[1], this[2], this[1], this[3]); }
  get gbbr() { return new this._Vec4(this[1], this[2], this[2], this[0]); }
  get gbbg() { return new this._Vec4(this[1], this[2], this[2], this[1]); }
  get gbbb() { return new this._Vec4(this[1], this[2], this[2], this[2]); }
  get gbba() { return new this._Vec4(this[1], this[2], this[2], this[3]); }
  get gbar() { return new this._Vec4(this[1], this[2], this[3], this[0]); }
  get gbag() { return new this._Vec4(this[1], this[2], this[3], this[1]); }
  get gbab() { return new this._Vec4(this[1], this[2], this[3], this[2]); }
  get gbaa() { return new this._Vec4(this[1], this[2], this[3], this[3]); }
  get garr() { return new this._Vec4(this[1], this[3], this[0], this[0]); }
  get garg() { return new this._Vec4(this[1], this[3], this[0], this[1]); }
  get garb() { return new this._Vec4(this[1], this[3], this[0], this[2]); }
  get gara() { return new this._Vec4(this[1], this[3], this[0], this[3]); }
  get gagr() { return new this._Vec4(this[1], this[3], this[1], this[0]); }
  get gagg() { return new this._Vec4(this[1], this[3], this[1], this[1]); }
  get gagb() { return new this._Vec4(this[1], this[3], this[1], this[2]); }
  get gaga() { return new this._Vec4(this[1], this[3], this[1], this[3]); }
  get gabr() { return new this._Vec4(this[1], this[3], this[2], this[0]); }
  get gabg() { return new this._Vec4(this[1], this[3], this[2], this[1]); }
  get gabb() { return new this._Vec4(this[1], this[3], this[2], this[2]); }
  get gaba() { return new this._Vec4(this[1], this[3], this[2], this[3]); }
  get gaar() { return new this._Vec4(this[1], this[3], this[3], this[0]); }
  get gaag() { return new this._Vec4(this[1], this[3], this[3], this[1]); }
  get gaab() { return new this._Vec4(this[1], this[3], this[3], this[2]); }
  get gaaa() { return new this._Vec4(this[1], this[3], this[3], this[3]); }
  get brrr() { return new this._Vec4(this[2], this[0], this[0], this[0]); }
  get brrg() { return new this._Vec4(this[2], this[0], this[0], this[1]); }
  get brrb() { return new this._Vec4(this[2], this[0], this[0], this[2]); }
  get brra() { return new this._Vec4(this[2], this[0], this[0], this[3]); }
  get brgr() { return new this._Vec4(this[2], this[0], this[1], this[0]); }
  get brgg() { return new this._Vec4(this[2], this[0], this[1], this[1]); }
  get brgb() { return new this._Vec4(this[2], this[0], this[1], this[2]); }
  get brga() { return new this._Vec4(this[2], this[0], this[1], this[3]); }
  get brbr() { return new this._Vec4(this[2], this[0], this[2], this[0]); }
  get brbg() { return new this._Vec4(this[2], this[0], this[2], this[1]); }
  get brbb() { return new this._Vec4(this[2], this[0], this[2], this[2]); }
  get brba() { return new this._Vec4(this[2], this[0], this[2], this[3]); }
  get brar() { return new this._Vec4(this[2], this[0], this[3], this[0]); }
  get brag() { return new this._Vec4(this[2], this[0], this[3], this[1]); }
  get brab() { return new this._Vec4(this[2], this[0], this[3], this[2]); }
  get braa() { return new this._Vec4(this[2], this[0], this[3], this[3]); }
  get bgrr() { return new this._Vec4(this[2], this[1], this[0], this[0]); }
  get bgrg() { return new this._Vec4(this[2], this[1], this[0], this[1]); }
  get bgrb() { return new this._Vec4(this[2], this[1], this[0], this[2]); }
  get bgra() { return new this._Vec4(this[2], this[1], this[0], this[3]); }
  get bggr() { return new this._Vec4(this[2], this[1], this[1], this[0]); }
  get bggg() { return new this._Vec4(this[2], this[1], this[1], this[1]); }
  get bggb() { return new this._Vec4(this[2], this[1], this[1], this[2]); }
  get bgga() { return new this._Vec4(this[2], this[1], this[1], this[3]); }
  get bgbr() { return new this._Vec4(this[2], this[1], this[2], this[0]); }
  get bgbg() { return new this._Vec4(this[2], this[1], this[2], this[1]); }
  get bgbb() { return new this._Vec4(this[2], this[1], this[2], this[2]); }
  get bgba() { return new this._Vec4(this[2], this[1], this[2], this[3]); }
  get bgar() { return new this._Vec4(this[2], this[1], this[3], this[0]); }
  get bgag() { return new this._Vec4(this[2], this[1], this[3], this[1]); }
  get bgab() { return new this._Vec4(this[2], this[1], this[3], this[2]); }
  get bgaa() { return new this._Vec4(this[2], this[1], this[3], this[3]); }
  get bbrr() { return new this._Vec4(this[2], this[2], this[0], this[0]); }
  get bbrg() { return new this._Vec4(this[2], this[2], this[0], this[1]); }
  get bbrb() { return new this._Vec4(this[2], this[2], this[0], this[2]); }
  get bbra() { return new this._Vec4(this[2], this[2], this[0], this[3]); }
  get bbgr() { return new this._Vec4(this[2], this[2], this[1], this[0]); }
  get bbgg() { return new this._Vec4(this[2], this[2], this[1], this[1]); }
  get bbgb() { return new this._Vec4(this[2], this[2], this[1], this[2]); }
  get bbga() { return new this._Vec4(this[2], this[2], this[1], this[3]); }
  get bbbr() { return new this._Vec4(this[2], this[2], this[2], this[0]); }
  get bbbg() { return new this._Vec4(this[2], this[2], this[2], this[1]); }
  get bbbb() { return new this._Vec4(this[2], this[2], this[2], this[2]); }
  get bbba() { return new this._Vec4(this[2], this[2], this[2], this[3]); }
  get bbar() { return new this._Vec4(this[2], this[2], this[3], this[0]); }
  get bbag() { return new this._Vec4(this[2], this[2], this[3], this[1]); }
  get bbab() { return new this._Vec4(this[2], this[2], this[3], this[2]); }
  get bbaa() { return new this._Vec4(this[2], this[2], this[3], this[3]); }
  get barr() { return new this._Vec4(this[2], this[3], this[0], this[0]); }
  get barg() { return new this._Vec4(this[2], this[3], this[0], this[1]); }
  get barb() { return new this._Vec4(this[2], this[3], this[0], this[2]); }
  get bara() { return new this._Vec4(this[2], this[3], this[0], this[3]); }
  get bagr() { return new this._Vec4(this[2], this[3], this[1], this[0]); }
  get bagg() { return new this._Vec4(this[2], this[3], this[1], this[1]); }
  get bagb() { return new this._Vec4(this[2], this[3], this[1], this[2]); }
  get baga() { return new this._Vec4(this[2], this[3], this[1], this[3]); }
  get babr() { return new this._Vec4(this[2], this[3], this[2], this[0]); }
  get babg() { return new this._Vec4(this[2], this[3], this[2], this[1]); }
  get babb() { return new this._Vec4(this[2], this[3], this[2], this[2]); }
  get baba() { return new this._Vec4(this[2], this[3], this[2], this[3]); }
  get baar() { return new this._Vec4(this[2], this[3], this[3], this[0]); }
  get baag() { return new this._Vec4(this[2], this[3], this[3], this[1]); }
  get baab() { return new this._Vec4(this[2], this[3], this[3], this[2]); }
  get baaa() { return new this._Vec4(this[2], this[3], this[3], this[3]); }
  get arrr() { return new this._Vec4(this[3], this[0], this[0], this[0]); }
  get arrg() { return new this._Vec4(this[3], this[0], this[0], this[1]); }
  get arrb() { return new this._Vec4(this[3], this[0], this[0], this[2]); }
  get arra() { return new this._Vec4(this[3], this[0], this[0], this[3]); }
  get argr() { return new this._Vec4(this[3], this[0], this[1], this[0]); }
  get argg() { return new this._Vec4(this[3], this[0], this[1], this[1]); }
  get argb() { return new this._Vec4(this[3], this[0], this[1], this[2]); }
  get arga() { return new this._Vec4(this[3], this[0], this[1], this[3]); }
  get arbr() { return new this._Vec4(this[3], this[0], this[2], this[0]); }
  get arbg() { return new this._Vec4(this[3], this[0], this[2], this[1]); }
  get arbb() { return new this._Vec4(this[3], this[0], this[2], this[2]); }
  get arba() { return new this._Vec4(this[3], this[0], this[2], this[3]); }
  get arar() { return new this._Vec4(this[3], this[0], this[3], this[0]); }
  get arag() { return new this._Vec4(this[3], this[0], this[3], this[1]); }
  get arab() { return new this._Vec4(this[3], this[0], this[3], this[2]); }
  get araa() { return new this._Vec4(this[3], this[0], this[3], this[3]); }
  get agrr() { return new this._Vec4(this[3], this[1], this[0], this[0]); }
  get agrg() { return new this._Vec4(this[3], this[1], this[0], this[1]); }
  get agrb() { return new this._Vec4(this[3], this[1], this[0], this[2]); }
  get agra() { return new this._Vec4(this[3], this[1], this[0], this[3]); }
  get aggr() { return new this._Vec4(this[3], this[1], this[1], this[0]); }
  get aggg() { return new this._Vec4(this[3], this[1], this[1], this[1]); }
  get aggb() { return new this._Vec4(this[3], this[1], this[1], this[2]); }
  get agga() { return new this._Vec4(this[3], this[1], this[1], this[3]); }
  get agbr() { return new this._Vec4(this[3], this[1], this[2], this[0]); }
  get agbg() { return new this._Vec4(this[3], this[1], this[2], this[1]); }
  get agbb() { return new this._Vec4(this[3], this[1], this[2], this[2]); }
  get agba() { return new this._Vec4(this[3], this[1], this[2], this[3]); }
  get agar() { return new this._Vec4(this[3], this[1], this[3], this[0]); }
  get agag() { return new this._Vec4(this[3], this[1], this[3], this[1]); }
  get agab() { return new this._Vec4(this[3], this[1], this[3], this[2]); }
  get agaa() { return new this._Vec4(this[3], this[1], this[3], this[3]); }
  get abrr() { return new this._Vec4(this[3], this[2], this[0], this[0]); }
  get abrg() { return new this._Vec4(this[3], this[2], this[0], this[1]); }
  get abrb() { return new this._Vec4(this[3], this[2], this[0], this[2]); }
  get abra() { return new this._Vec4(this[3], this[2], this[0], this[3]); }
  get abgr() { return new this._Vec4(this[3], this[2], this[1], this[0]); }
  get abgg() { return new this._Vec4(this[3], this[2], this[1], this[1]); }
  get abgb() { return new this._Vec4(this[3], this[2], this[1], this[2]); }
  get abga() { return new this._Vec4(this[3], this[2], this[1], this[3]); }
  get abbr() { return new this._Vec4(this[3], this[2], this[2], this[0]); }
  get abbg() { return new this._Vec4(this[3], this[2], this[2], this[1]); }
  get abbb() { return new this._Vec4(this[3], this[2], this[2], this[2]); }
  get abba() { return new this._Vec4(this[3], this[2], this[2], this[3]); }
  get abar() { return new this._Vec4(this[3], this[2], this[3], this[0]); }
  get abag() { return new this._Vec4(this[3], this[2], this[3], this[1]); }
  get abab() { return new this._Vec4(this[3], this[2], this[3], this[2]); }
  get abaa() { return new this._Vec4(this[3], this[2], this[3], this[3]); }
  get aarr() { return new this._Vec4(this[3], this[3], this[0], this[0]); }
  get aarg() { return new this._Vec4(this[3], this[3], this[0], this[1]); }
  get aarb() { return new this._Vec4(this[3], this[3], this[0], this[2]); }
  get aara() { return new this._Vec4(this[3], this[3], this[0], this[3]); }
  get aagr() { return new this._Vec4(this[3], this[3], this[1], this[0]); }
  get aagg() { return new this._Vec4(this[3], this[3], this[1], this[1]); }
  get aagb() { return new this._Vec4(this[3], this[3], this[1], this[2]); }
  get aaga() { return new this._Vec4(this[3], this[3], this[1], this[3]); }
  get aabr() { return new this._Vec4(this[3], this[3], this[2], this[0]); }
  get aabg() { return new this._Vec4(this[3], this[3], this[2], this[1]); }
  get aabb() { return new this._Vec4(this[3], this[3], this[2], this[2]); }
  get aaba() { return new this._Vec4(this[3], this[3], this[2], this[3]); }
  get aaar() { return new this._Vec4(this[3], this[3], this[3], this[0]); }
  get aaag() { return new this._Vec4(this[3], this[3], this[3], this[1]); }
  get aaab() { return new this._Vec4(this[3], this[3], this[3], this[2]); }
  get aaaa() { return new this._Vec4(this[3], this[3], this[3], this[3]); }
}

type Tuple2<S> = [S, S];
type Tuple3<S> = [S, S, S];
type Tuple4<S> = [S, S, S, S];

abstract class Vec2<S> extends VecBase<S> implements Tuple2<S> {
  declare readonly length: 2;

  e0: S;
  e1: S;

  constructor(x?: S, y?: S) {
    super(2);
    this.e0 = this.castElement()(x);
    this.e1 = this.castElement()(y ?? x);
  }

  get 0() {
    return this.e0;
  }

  get 1() {
    return this.e1;
  }

  set 0(value: S) {
    this.e0 = this.castElement()(value);
  }

  set 1(value: S) {
    this.e1 = this.castElement()(value);
  }

  get x() {
    return this[0];
  }

  get y() {
    return this[1];
  }

  set x(value: S) {
    this[0] = this.castElement()(value);
  }

  set y(value: S) {
    this[1] = this.castElement()(value);
  }

  get r() {
    return this[0];
  }

  get g() {
    return this[1];
  }

  set r(value: S) {
    this[0] = this.castElement()(value);
  }

  set g(value: S) {
    this[1] = this.castElement()(value);
  }
}

abstract class Vec3<S> extends VecBase<S> implements Tuple3<S> {
  declare readonly length: 3;

  e0: S;
  e1: S;
  e2: S;

  constructor(x?: S, y?: S, z?: S) {
    super(3);
    this.e0 = this.castElement()(x);
    this.e1 = this.castElement()(y ?? x);
    this.e2 = this.castElement()(z ?? x);
  }

  get 0() {
    return this.e0;
  }

  get 1() {
    return this.e1;
  }

  get 2() {
    return this.e2;
  }

  set 0(value: S) {
    this.e0 = this.castElement()(value);
  }

  set 1(value: S) {
    this.e1 = this.castElement()(value);
  }

  set 2(value: S) {
    this.e2 = this.castElement()(value);
  }

  get x() {
    return this[0];
  }

  get y() {
    return this[1];
  }

  get z() {
    return this[2];
  }

  set x(value: S) {
    this[0] = this.castElement()(value);
  }

  set y(value: S) {
    this[1] = this.castElement()(value);
  }

  set z(value: S) {
    this[2] = this.castElement()(value);
  }

  get r() {
    return this[0];
  }

  get g() {
    return this[1];
  }

  get b() {
    return this[2];
  }

  set r(value: S) {
    this[0] = this.castElement()(value);
  }

  set g(value: S) {
    this[1] = this.castElement()(value);
  }

  set b(value: S) {
    this[2] = this.castElement()(value);
  }
}

abstract class Vec4<S> extends VecBase<S> implements Tuple4<S> {
  declare readonly length: 4;

  e0: S;
  e1: S;
  e2: S;
  e3: S;

  constructor(x?: S, y?: S, z?: S, w?: S) {
    super(4);
    this.e0 = this.castElement()(x);
    this.e1 = this.castElement()(y ?? x);
    this.e2 = this.castElement()(z ?? x);
    this.e3 = this.castElement()(w ?? x);
  }

  get 0() {
    return this.e0;
  }

  get 1() {
    return this.e1;
  }

  get 2() {
    return this.e2;
  }

  get 3() {
    return this.e3;
  }

  set 0(value: S) {
    this.e0 = this.castElement()(value);
  }

  set 1(value: S) {
    this.e1 = this.castElement()(value);
  }

  set 2(value: S) {
    this.e2 = this.castElement()(value);
  }

  set 3(value: S) {
    this.e3 = this.castElement()(value);
  }

  get x() {
    return this[0];
  }

  get y() {
    return this[1];
  }

  get r() {
    return this[0];
  }

  get g() {
    return this[1];
  }

  get b() {
    return this[2];
  }

  get a() {
    return this[3];
  }

  set r(value: S) {
    this[0] = value;
  }

  set g(value: S) {
    this[1] = value;
  }

  set b(value: S) {
    this[2] = value;
  }

  set a(value: S) {
    this[3] = value;
  }

  get z() {
    return this[2];
  }

  get w() {
    return this[3];
  }

  set x(value: S) {
    this[0] = value;
  }

  set y(value: S) {
    this[1] = value;
  }

  set z(value: S) {
    this[2] = value;
  }

  set w(value: S) {
    this[3] = value;
  }
}

export class Vec2fImpl extends Vec2<number> {
  get [$internal]() {
    return {
      elementSchema: f32,
    };
  }

  get kind() {
    return 'vec2f' as const;
  }

  get _Vec2() {
    return Vec2fImpl;
  }
  get _Vec3() {
    return Vec3fImpl;
  }
  get _Vec4() {
    return Vec4fImpl;
  }
}

export class Vec2hImpl extends Vec2<number> {
  get [$internal]() {
    return {
      elementSchema: f16,
    };
  }

  get kind() {
    return 'vec2h' as const;
  }

  get _Vec2() {
    return Vec2hImpl;
  }
  get _Vec3() {
    return Vec3hImpl;
  }
  get _Vec4() {
    return Vec4hImpl;
  }
}

export class Vec2iImpl extends Vec2<number> {
  get [$internal]() {
    return {
      elementSchema: i32,
    };
  }

  get kind() {
    return 'vec2i' as const;
  }

  get _Vec2() {
    return Vec2iImpl;
  }
  get _Vec3() {
    return Vec3iImpl;
  }
  get _Vec4() {
    return Vec4iImpl;
  }
}

export class Vec2uImpl extends Vec2<number> {
  get [$internal]() {
    return {
      elementSchema: u32,
    };
  }

  get kind() {
    return 'vec2u' as const;
  }

  get _Vec2() {
    return Vec2uImpl;
  }
  get _Vec3() {
    return Vec3uImpl;
  }
  get _Vec4() {
    return Vec4uImpl;
  }
}

export class Vec2bImpl extends Vec2<boolean> {
  get [$internal]() {
    return {
      elementSchema: bool,
    };
  }

  get kind() {
    return 'vec2<bool>' as const;
  }

  get _Vec2() {
    return Vec2bImpl;
  }
  get _Vec3() {
    return Vec3bImpl;
  }
  get _Vec4() {
    return Vec4bImpl;
  }
}

export class Vec3fImpl extends Vec3<number> {
  get [$internal]() {
    return {
      elementSchema: f32,
    };
  }

  get kind() {
    return 'vec3f' as const;
  }

  get _Vec2() {
    return Vec2fImpl;
  }
  get _Vec3() {
    return Vec3fImpl;
  }
  get _Vec4() {
    return Vec4fImpl;
  }
}

export class Vec3hImpl extends Vec3<number> {
  get [$internal]() {
    return {
      elementSchema: f16,
    };
  }

  get kind() {
    return 'vec3h' as const;
  }

  get _Vec2() {
    return Vec2hImpl;
  }
  get _Vec3() {
    return Vec3hImpl;
  }
  get _Vec4() {
    return Vec4hImpl;
  }
}

export class Vec3iImpl extends Vec3<number> {
  get [$internal]() {
    return {
      elementSchema: i32,
    };
  }

  get kind() {
    return 'vec3i' as const;
  }

  get _Vec2() {
    return Vec2iImpl;
  }
  get _Vec3() {
    return Vec3iImpl;
  }
  get _Vec4() {
    return Vec4iImpl;
  }
}

export class Vec3uImpl extends Vec3<number> {
  get [$internal]() {
    return {
      elementSchema: u32,
    };
  }

  get kind() {
    return 'vec3u' as const;
  }

  get _Vec2() {
    return Vec2uImpl;
  }
  get _Vec3() {
    return Vec3uImpl;
  }
  get _Vec4() {
    return Vec4uImpl;
  }
}

export class Vec3bImpl extends Vec3<boolean> {
  get [$internal]() {
    return {
      elementSchema: bool,
    };
  }

  get kind() {
    return 'vec3<bool>' as const;
  }

  get _Vec2() {
    return Vec2bImpl;
  }
  get _Vec3() {
    return Vec3bImpl;
  }
  get _Vec4() {
    return Vec4bImpl;
  }
}

export class Vec4fImpl extends Vec4<number> {
  get [$internal]() {
    return {
      elementSchema: f32,
    };
  }

  get kind() {
    return 'vec4f' as const;
  }

  get _Vec2() {
    return Vec2fImpl;
  }
  get _Vec3() {
    return Vec3fImpl;
  }
  get _Vec4() {
    return Vec4fImpl;
  }
}

export class Vec4hImpl extends Vec4<number> {
  get [$internal]() {
    return {
      elementSchema: f16,
    };
  }

  get kind() {
    return 'vec4h' as const;
  }

  get _Vec2() {
    return Vec2hImpl;
  }
  get _Vec3() {
    return Vec3hImpl;
  }
  get _Vec4() {
    return Vec4hImpl;
  }
}

export class Vec4iImpl extends Vec4<number> {
  get [$internal]() {
    return {
      elementSchema: i32,
    };
  }

  get kind() {
    return 'vec4i' as const;
  }

  get _Vec2() {
    return Vec2iImpl;
  }
  get _Vec3() {
    return Vec3iImpl;
  }
  get _Vec4() {
    return Vec4iImpl;
  }
}

export class Vec4uImpl extends Vec4<number> {
  get [$internal]() {
    return {
      elementSchema: u32,
    };
  }

  get kind() {
    return 'vec4u' as const;
  }

  get _Vec2() {
    return Vec2uImpl;
  }
  get _Vec3() {
    return Vec3uImpl;
  }
  get _Vec4() {
    return Vec4uImpl;
  }
}

export class Vec4bImpl extends Vec4<boolean> {
  get [$internal]() {
    return {
      elementSchema: bool,
    };
  }

  get kind() {
    return 'vec4<bool>' as const;
  }

  get _Vec2() {
    return Vec2bImpl;
  }
  get _Vec3() {
    return Vec3bImpl;
  }
  get _Vec4() {
    return Vec4bImpl;
  }
}
