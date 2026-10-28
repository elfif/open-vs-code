import type {
  ModelOption,
  PromptCatalog,
  PromptModel,
  PromptSelection,
  SessionListItem,
} from "@shared/protocol";

export interface ProviderModelGroup {
  readonly id: string;
  readonly name: string;
  readonly models: readonly ModelOption[];
}

export function createPromptSelection(
  catalog: PromptCatalog,
  session?: SessionListItem,
): PromptSelection | null {
  const agent =
    catalog.agents.find((candidate) => candidate.id === session?.agent) ?? catalog.agents[0];
  const fallbackModel = catalog.defaultModel ?? catalog.models[0];
  const model = session?.model ?? agent?.model ?? fallbackModel;

  if (!agent || !model) {
    return null;
  }

  return { agent: agent.id, model: normalizeVariant(catalog, model) };
}

export function reconcilePromptSelection(
  catalog: PromptCatalog,
  selection: PromptSelection,
): PromptSelection | null {
  const agent = catalog.agents.find((candidate) => candidate.id === selection.agent);

  if (!agent) {
    return createPromptSelection(catalog);
  }

  if (selectedModelOption(catalog, selection)) {
    return { agent: agent.id, model: normalizeVariant(catalog, selection.model) };
  }

  const replacement = [agent.model, catalog.defaultModel, catalog.models[0]].find(
    (candidate): candidate is PromptModel =>
      candidate !== undefined &&
      candidate !== null &&
      catalog.models.some(
        (model) => model.id === candidate.id && model.providerID === candidate.providerID,
      ),
  );

  return replacement ? { agent: agent.id, model: normalizeVariant(catalog, replacement) } : null;
}

export function applyAgentSelection(
  catalog: PromptCatalog,
  selection: PromptSelection,
  agentID: string,
): PromptSelection {
  const agent = catalog.agents.find((candidate) => candidate.id === agentID);

  if (!agent) {
    return selection;
  }

  return {
    agent: agent.id,
    model: agent.model ? normalizeVariant(catalog, agent.model) : selection.model,
  };
}

export function applyModelSelection(
  selection: PromptSelection,
  model: PromptModel,
): PromptSelection {
  return {
    ...selection,
    model: { providerID: model.providerID, id: model.id },
  };
}

export function applyVariantSelection(
  selection: PromptSelection,
  variant: string | undefined,
): PromptSelection {
  return {
    ...selection,
    model: {
      providerID: selection.model.providerID,
      id: selection.model.id,
      ...(variant ? { variant } : {}),
    },
  };
}

export function selectedAgentColor(
  catalog: PromptCatalog | null,
  selection: PromptSelection | null,
): string | undefined {
  if (!catalog || !selection) {
    return undefined;
  }

  return catalog.agents.find((agent) => agent.id === selection.agent)?.color;
}

export function selectedModelOption(
  catalog: PromptCatalog,
  selection: PromptSelection,
): ModelOption | undefined {
  return catalog.models.find(
    (model) => model.id === selection.model.id && model.providerID === selection.model.providerID,
  );
}

export function groupModelsByProvider(catalog: PromptCatalog, query: string): ProviderModelGroup[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const providerNames = new Map(catalog.providers.map((provider) => [provider.id, provider.name]));
  const groups = new Map<string, ModelOption[]>();

  for (const model of catalog.models) {
    const providerName = providerNames.get(model.providerID) ?? model.providerID;
    const matches =
      !normalizedQuery ||
      model.name.toLocaleLowerCase().includes(normalizedQuery) ||
      model.id.toLocaleLowerCase().includes(normalizedQuery) ||
      providerName.toLocaleLowerCase().includes(normalizedQuery);

    if (!matches) {
      continue;
    }

    groups.set(model.providerID, [...(groups.get(model.providerID) ?? []), model]);
  }

  return [...groups.entries()]
    .map(([id, models]) => ({ id, name: providerNames.get(id) ?? id, models }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeVariant(catalog: PromptCatalog, model: PromptModel): PromptModel {
  const option = catalog.models.find(
    (candidate) => candidate.id === model.id && candidate.providerID === model.providerID,
  );

  if (!model.variant || !option || option.variants.includes(model.variant)) {
    return {
      providerID: model.providerID,
      id: model.id,
      ...(model.variant ? { variant: model.variant } : {}),
    };
  }

  return { providerID: model.providerID, id: model.id };
}
