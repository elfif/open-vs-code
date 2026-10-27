import type { ReactNode } from "react";
import {
  $applyNodeReplacement,
  DecoratorNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";

import { ContextBadge } from "@/components/ContextBadge";
import type { PromptContextSegment } from "@shared/promptContent";

type SerializedContextBadgeNode = Spread<
  { readonly segment: PromptContextSegment },
  SerializedLexicalNode
>;

export class ContextBadgeNode extends DecoratorNode<ReactNode> {
  private readonly segment: PromptContextSegment;

  public static getType(): string {
    return "opencode-context-badge";
  }

  public static clone(node: ContextBadgeNode): ContextBadgeNode {
    return new ContextBadgeNode(node.segment, node.__key);
  }

  public static importJSON(serializedNode: SerializedContextBadgeNode): ContextBadgeNode {
    return new ContextBadgeNode(serializedNode.segment).updateFromJSON(serializedNode);
  }

  public constructor(segment: PromptContextSegment, key?: NodeKey) {
    super(key);
    this.segment = segment;
  }

  public exportJSON(): SerializedContextBadgeNode {
    return { ...super.exportJSON(), segment: this.segment };
  }

  public createDOM(): HTMLElement {
    return document.createElement("span");
  }

  public updateDOM(): false {
    return false;
  }

  public isInline(): boolean {
    return true;
  }

  public getSegment(): PromptContextSegment {
    return this.segment;
  }

  public decorate(): ReactNode {
    return <ContextBadge segment={this.segment} nodeKey={this.getKey()} />;
  }
}

export function $createContextBadgeNode(segment: PromptContextSegment): ContextBadgeNode {
  return $applyNodeReplacement(new ContextBadgeNode(segment));
}

export function $isContextBadgeNode(node: unknown): node is ContextBadgeNode {
  return node instanceof ContextBadgeNode;
}
