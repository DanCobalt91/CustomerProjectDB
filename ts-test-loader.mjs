import { access, readFile } from 'node:fs/promises'
import { dirname, resolve as pathResolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const TS_EXTENSIONS = ['.ts', '.tsx']

function isRelative(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../')
}

function resolveToPath(specifier, parentURL) {
  if (specifier.startsWith('file://')) {
    return fileURLToPath(specifier)
  }

  if (parentURL) {
    const parentPath = fileURLToPath(parentURL)
    return pathResolve(dirname(parentPath), specifier)
  }

  return pathResolve(specifier)
}

export async function resolve(specifier, context, defaultResolve) {
  if (TS_EXTENSIONS.some(ext => specifier.endsWith(ext))) {
    const resolvedPath = resolveToPath(specifier, context.parentURL)
    return { url: pathToFileURL(resolvedPath).href, shortCircuit: true }
  }

  if (isRelative(specifier) && context.parentURL) {
    for (const ext of TS_EXTENSIONS) {
      const candidatePath = resolveToPath(specifier + ext, context.parentURL)
      try {
        await access(candidatePath)
        return { url: pathToFileURL(candidatePath).href, shortCircuit: true }
      } catch {
        // continue searching
      }
    }
  }

  return defaultResolve(specifier, context, defaultResolve)
}

export async function load(url, context, defaultLoad) {
  if (TS_EXTENSIONS.some(ext => url.endsWith(ext))) {
    const source = await readFile(new URL(url), 'utf8')
    const transformed = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        sourceMap: false,
      },
      fileName: fileURLToPath(url),
    })

    return { format: 'module', source: transformed.outputText, shortCircuit: true }
  }

  return defaultLoad(url, context, defaultLoad)
}
