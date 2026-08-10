import type Konva from 'konva'

let stageInstance: Konva.Stage | null = null

export function setStageRef(stage: Konva.Stage | null) {
  stageInstance = stage
}

export function getStageRef(): Konva.Stage | null {
  return stageInstance
}
