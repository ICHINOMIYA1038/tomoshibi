import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import * as THREE from 'three'

const bundlePath = resolve('node_modules/.cache/akaoni-review-illuminance.mjs')
await mkdir(resolve('node_modules/.cache'), { recursive: true })
await build({
  entryPoints: ['src/photometric/illuminance.ts'],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  loader: { '.ies': 'text' },
  logLevel: 'silent',
})

const { measureIlluminance } = await import(pathToFileURL(bundlePath).href)
const data = JSON.parse(await readFile(resolve('public/mock/demos/akaoni-study.json'), 'utf8'))
const floorNormal = new THREE.Vector3(0, 1, 0)
const faceNormal = new THREE.Vector3(0, 0, 1)
const backdropNormal = new THREE.Vector3(0, 0, 1)

function summary(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length
  const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length
  return {
    minLux: +sorted[0].toFixed(1),
    p10Lux: +sorted[Math.floor((sorted.length - 1) * 0.1)].toFixed(1),
    medianLux: +sorted[Math.floor((sorted.length - 1) * 0.5)].toFixed(1),
    p90Lux: +sorted[Math.floor((sorted.length - 1) * 0.9)].toFixed(1),
    maxLux: +sorted.at(-1).toFixed(1),
    cv: +(Math.sqrt(variance) / mean).toFixed(2),
  }
}

const reviews = data.productionPlan.scenes.map(scene => {
  const fixtures = scene.fixtures.filter(fixture => fixture.enabled)
  const floor = []
  for (const z of [-5, -4, -3, -2, -1]) {
    for (const x of [-4, -3, -2, -1, 0, 1, 2, 3, 4]) {
      floor.push(measureIlluminance(new THREE.Vector3(x, 0.1, z), floorNormal, fixtures).totalLux)
    }
  }
  const backdrop = []
  for (const y of [1.5, 3.5, 5.5]) {
    for (const x of [-4, 0, 4]) {
      backdrop.push(measureIlluminance(new THREE.Vector3(x, y, -7.59), backdropNormal, fixtures).totalLux)
    }
  }
  const faces = scene.performers.filter(person => person.onStage).map(person => ({
    name: person.name,
    lux: +measureIlluminance(
      new THREE.Vector3(person.position[0], person.position[1] + 1.6, person.position[2]),
      faceNormal,
      fixtures,
    ).totalLux.toFixed(1),
  }))
  return { scene: scene.title, fixtures: fixtures.length, floor: summary(floor), backdrop: summary(backdrop), faces }
})

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(reviews, null, 2))
} else {
  for (const review of reviews) {
    const faces = review.faces.map(face => `${face.name} ${face.lux}`).join(' / ')
    console.log(`${review.scene}\t床 ${review.floor.p10Lux}–${review.floor.p90Lux} lux (CV ${review.floor.cv})\t顔 ${faces} lux`)
  }
}
