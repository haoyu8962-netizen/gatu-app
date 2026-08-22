import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const assetsDirectory = path.resolve(process.argv[2] ?? 'apps/terminal/.output/public/assets')
const files = (await readdir(assetsDirectory)).filter((file) => file.endsWith('.js'))
const fileSet = new Set(files)
const graph = new Map()

const staticImportPatterns = [
  /\bimport\s*["'](\.\/[^"']+\.js)["']/g,
  /\bimport(?!\s*\()[^;]*?\bfrom\s*["'](\.\/[^"']+\.js)["']/g,
  /\bexport(?:\s+|\{|\*)[^;]*?\bfrom\s*["'](\.\/[^"']+\.js)["']/g,
]

for (const file of files) {
  const source = await readFile(path.join(assetsDirectory, file), 'utf8')
  const dependencies = new Set()

  for (const pattern of staticImportPatterns) {
    for (const match of source.matchAll(pattern)) {
      const dependency = path.basename(match[1])
      if (dependency !== file && fileSet.has(dependency)) dependencies.add(dependency)
    }
  }

  graph.set(file, dependencies)
}

const visited = new Set()
const active = new Set()
const stack = []

function findCycle(file) {
  if (active.has(file)) {
    const cycleStart = stack.indexOf(file)
    return [...stack.slice(cycleStart), file]
  }
  if (visited.has(file)) return null

  visited.add(file)
  active.add(file)
  stack.push(file)

  for (const dependency of graph.get(file) ?? []) {
    const cycle = findCycle(dependency)
    if (cycle) return cycle
  }

  stack.pop()
  active.delete(file)
  return null
}

for (const file of files) {
  const cycle = findCycle(file)
  if (cycle) {
    console.error(`Circular client chunk dependency detected: ${cycle.join(' -> ')}`)
    process.exit(1)
  }
}

console.log(`Verified ${files.length} client chunks: no circular static imports.`)
