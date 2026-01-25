import weaviate from "weaviate-ts-client";

console.log("Type of default export:", typeof weaviate);
console.log("Keys of default export:", Object.keys(weaviate));
console.log("weaviate.client:", (weaviate as any).client);
console.log("weaviate.default:", (weaviate as any).default);

try {
    console.log("Attempting call as function...");
    (weaviate as any)();
} catch (e: any) {
    console.log("Call failed:", e.message);
}
