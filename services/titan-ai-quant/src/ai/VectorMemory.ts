import weaviate, { ApiKey, WeaviateClient } from "weaviate-ts-client";

export class VectorMemory {
  private client: WeaviateClient;
  private className = "TitanMemory";

  constructor() {
    // @ts-ignore - weaviate-ts-client types can be tricky with default import
    this.client = (weaviate.default || weaviate).client({
      scheme: "http",
      host: process.env.WEAVIATE_HOST || "localhost:8080",
      apiKey: new ApiKey(process.env.WEAVIATE_API_KEY || ""),
    });
  }

  async init() {
    // Check if schema exists, if not create
    try {
      const exists = await this.client.schema
        .classCreator()
        .withClass({
          class: this.className,
          vectorizer: "text2vec-transformers",
          properties: [
            { name: "content", dataType: ["text"] },
            { name: "metadata", dataType: ["text"] },
            { name: "timestamp", dataType: ["date"] },
          ],
        })
        .do();
      console.log("Weaviate Schema Initialized");
    } catch (e) {
      // likely already exists
    }
  }

  async save(content: string, metadata: object = {}) {
    await this.client.data
      .creator()
      .withClassName(this.className)
      .withProperties({
        content,
        metadata: JSON.stringify(metadata),
        timestamp: new Date().toISOString(),
      })
      .do();
  }

  async search(query: string, limit: number = 5): Promise<string[]> {
    const res = await this.client.graphql
      .get()
      .withClassName(this.className)
      .withFields("content metadata")
      .withNearText({ concepts: [query] })
      .withLimit(limit)
      .do();

    return res.data.Get[this.className].map((item: any) => item.content);
  }
}
