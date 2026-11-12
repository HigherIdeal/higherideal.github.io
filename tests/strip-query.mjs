export async function resolve(specifier, context, nextResolve) {
  const query = specifier.indexOf("?");
  const clean = query === -1 ? specifier : specifier.slice(0, query);
  return nextResolve(clean, context);
}
