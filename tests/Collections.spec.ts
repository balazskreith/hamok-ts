import * as Collections from "../src/common/Collections";

describe("Collections", () => {
    describe("equalSets", () => {
        it("When set(1, 2) and set(1) are compared Then it return false", () => {
            expect(Collections.equalSets<number>(
                new Set<number>([1, 2]),
                new Set<number>([1]),
            )).toBe(false);
        });

        it("When set(1) and set(1, 2) are compared Then it return false", () => {
            expect(Collections.equalSets<number>(
                new Set<number>([1]),
                new Set<number>([1, 2]),
            )).toBe(false);
        });

        it("When set(1, 2) and set(1, 2) are compared Then it return true", () => {
            expect(Collections.equalSets<number>(
                new Set<number>([1, 2]),
                new Set<number>([1, 2]),
            )).toBe(true);
        });

        it("When set(1, 2) and set(1, 2) and set(1) are compared Then it return false", () => {
            expect(Collections.equalSets<number>(
                new Set<number>([1, 2]),
                new Set<number>([1, 2]),
                new Set<number>([1]),
            )).toBe(false);
        });

        it("When set(1, 2) and set(1, 2) and set(1, 2) are compared Then it return true", () => {
            expect(Collections.equalSets<number>(
                new Set<number>([1, 2]),
                new Set<number>([1, 2]),
                new Set<number>([1, 2]),
            )).toBe(true);
        });

    });
});