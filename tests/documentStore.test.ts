import { describe, expect, it } from "vitest";

import { createDocumentFromBytes, DocumentStore } from "../src/services/documentStore";

describe("createDocumentFromBytes", () => {
  it("creates a text document", () => {
    const document = createDocumentFromBytes({
      name: "notes.txt",
      base64: Buffer.from("hello", "utf8").toString("base64"),
    });

    expect(document).toMatchObject({
      kind: "document",
      name: "notes.txt",
      mime: "text/plain",
      size: 5,
      documentKind: "text",
      text: "hello",
    });
    expect(document.base64).toBeUndefined();
  });

  it("creates an image document", () => {
    const document = createDocumentFromBytes({
      name: "diagram.png",
      base64: Buffer.from("image").toString("base64"),
    });

    expect(document).toMatchObject({
      name: "diagram.png",
      mime: "image/png",
      documentKind: "image",
      base64: Buffer.from("image").toString("base64"),
    });
    expect(document.text).toBeUndefined();
  });

  it("rejects unsupported files", () => {
    expect(() =>
      createDocumentFromBytes({
        name: "doc.docx",
        base64: Buffer.from("binary").toString("base64"),
      }),
    ).toThrow("not supported");
  });

  it("rejects invalid UTF-8 text", () => {
    expect(() =>
      createDocumentFromBytes({
        name: "bad.txt",
        base64: Buffer.from([0xff, 0xfe]).toString("base64"),
      }),
    ).toThrow("not valid UTF-8");
  });

  it("rejects empty binary documents", () => {
    expect(() =>
      createDocumentFromBytes({
        name: "empty.png",
        base64: "",
      }),
    ).toThrow("empty");
  });
});

describe("DocumentStore", () => {
  it("stores, moves, removes, and clears documents", () => {
    const store = new DocumentStore();
    const document = createDocumentFromBytes({
      name: "notes.txt",
      base64: Buffer.from("hello", "utf8").toString("base64"),
    });

    store.add("pending", document);
    expect(store.get("pending", document.id)).toBe(document);

    store.moveAll("pending", "session_1");
    expect(store.get("pending", document.id)).toBeUndefined();
    expect(store.get("session_1", document.id)).toBe(document);

    store.remove("session_1", [document.id]);
    expect(store.getSessionMap("session_1").size).toBe(0);

    store.add("session_2", document);
    store.clearAll();
    expect(store.get("session_2", document.id)).toBeUndefined();
  });
});
