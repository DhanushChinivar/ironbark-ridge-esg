import { ref, type Ref } from 'vue';

export interface Async<T> {
  data: Ref<T | null>;
  error: Ref<string | null>;
  loading: Ref<boolean>;
}

// Every view needs the same three states. Errors surface as a message rather
// than an empty panel, so a failed fetch never looks like "no data".
export function useAsync<T>(load: () => Promise<T>): Async<T> {
  const data = ref<T | null>(null) as Ref<T | null>;
  const error = ref<string | null>(null);
  const loading = ref(true);

  load()
    .then((v) => (data.value = v))
    .catch((e: unknown) => (error.value = e instanceof Error ? e.message : String(e)))
    .finally(() => (loading.value = false));

  return { data, error, loading };
}
