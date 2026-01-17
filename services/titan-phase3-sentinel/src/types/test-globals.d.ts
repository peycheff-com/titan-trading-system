declare global {
    namespace NodeJS {
        interface Global {
            testUtils: {
                randomPrice: (min?: number, max?: number) => number;
                randomBasis: (min?: number, max?: number) => number;
                randomSize: (min?: number, max?: number) => number;
            };
        }
    }
}

export {};
