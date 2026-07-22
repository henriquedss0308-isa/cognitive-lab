/**
 * Resolve os imports TypeScript sem extensão já usados pelo aplicativo.
 * A transformação de tipos é feita nativamente pelo Node 24; este loader não
 * transpila, não cria cache e não escreve arquivos.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (originalError) {
    const isLocal = specifier.startsWith('.') || specifier.startsWith('/')
    const hasExtension = /\.[a-z0-9]+$/i.test(specifier)
    if (!isLocal || hasExtension) throw originalError

    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
      try {
        return await nextResolve(candidate, context)
      } catch {
        // Tenta a próxima forma local antes de devolver o erro original.
      }
    }
    throw originalError
  }
}
