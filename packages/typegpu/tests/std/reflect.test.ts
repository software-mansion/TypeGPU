import { describe, expect, it } from 'vitest';
import { vec2f, vec3f } from '../../src/data';
import { reflect } from '../../src/std';

describe('reflect', () => {
	it('reflects a vec2f vector correctly', () => {
		const I = vec2f(1, -1);
		const N = vec2f(0, 1);
		expect(reflect(I, N)).toEqual(vec2f(1, 1));
	});

	it('reflects a vec3f vector correctly', () => {
		const I = vec3f(1, -1, 0);
		const N = vec3f(0, 1, 0);
		expect(reflect(I, N)).toEqual(vec3f(1, 1, 0));
	});

	it('reflects a vec2f vector with no angle change when incident angle is zero', () => {
		const I = vec2f(3, 4);
		const N = vec2f(0, 1);
		expect(reflect(I, N)).toEqual(vec2f(3, -4));
	});
});
