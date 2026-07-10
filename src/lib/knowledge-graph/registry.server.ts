/**
 * Knowledge Graph — publisher regiszter. SERVER-ONLY.
 *
 * Memóriabeli map arra, melyik modul milyen `source_kind`-okat publikál a
 * gráfba. A `projectFromSource` a futás után írja a `kg_publishers` táblát;
 * ez a regiszter csak leíró információ arról, ki minek a "gazdája".
 *
 * KG-1: csak a regisztráció mechanizmusa — még nincsenek beregisztrált
 * publisherek (a Website publisher a WK sprintekben jön).
 */

type PublisherDescriptor = {
  module: string;
  source_kind: string;
  description?: string;
};

const REGISTRY = new Map<string, PublisherDescriptor>();

function key(module: string, source_kind: string): string {
  return `${module}::${source_kind}`;
}

export function registerPublisher(desc: PublisherDescriptor): void {
  REGISTRY.set(key(desc.module, desc.source_kind), desc);
}

export function listPublishers(): PublisherDescriptor[] {
  return Array.from(REGISTRY.values());
}

export function hasPublisher(module: string, source_kind: string): boolean {
  return REGISTRY.has(key(module, source_kind));
}