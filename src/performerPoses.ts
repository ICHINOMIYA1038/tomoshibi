export type PerformerPose = 'standing' | 'sitting' | 'kneeling' | 'lying'

export const PERFORMER_POSES: { value: PerformerPose; label: string }[] = [
  { value: 'standing', label: '立つ' },
  { value: 'sitting', label: '座る' },
  { value: 'kneeling', label: 'ひざをつく' },
  { value: 'lying', label: '横たわる' },
]

export type Joint = [number, number, number]
export type PoseFrame = {
  head: Joint
  neck: Joint
  shoulder: Joint
  hip: Joint
  leftShoulder: Joint
  rightShoulder: Joint
  leftElbow: Joint
  rightElbow: Joint
  leftHand: Joint
  rightHand: Joint
  leftHip: Joint
  rightHip: Joint
  leftKnee: Joint
  rightKnee: Joint
  leftFoot: Joint
  rightFoot: Joint
}

export const POSE_FRAMES: Record<PerformerPose, PoseFrame> = {
  standing: {
    head: [0, 1.62, 0], neck: [0, 1.46, 0], shoulder: [0, 1.35, 0], hip: [0, 0.90, 0],
    leftShoulder: [-0.18, 1.35, 0], rightShoulder: [0.18, 1.35, 0],
    leftElbow: [-0.23, 1.0, 0], rightElbow: [0.23, 1.0, 0],
    leftHand: [-0.23, 0.66, 0.01], rightHand: [0.23, 0.66, 0.01],
    leftHip: [-0.08, 0.86, 0], rightHip: [0.08, 0.86, 0],
    leftKnee: [-0.08, 0.40, 0], rightKnee: [0.08, 0.40, 0],
    leftFoot: [-0.08, 0.05, 0.06], rightFoot: [0.08, 0.05, 0.06],
  },
  sitting: {
    head: [0, 1.18, 0], neck: [0, 1.02, 0], shoulder: [0, 0.93, 0], hip: [0, 0.48, 0],
    leftShoulder: [-0.18, 0.93, 0], rightShoulder: [0.18, 0.93, 0],
    leftElbow: [-0.23, 0.68, 0.07], rightElbow: [0.23, 0.68, 0.07],
    leftHand: [-0.16, 0.49, 0.28], rightHand: [0.16, 0.49, 0.28],
    leftHip: [-0.09, 0.46, 0], rightHip: [0.09, 0.46, 0],
    leftKnee: [-0.09, 0.43, 0.38], rightKnee: [0.09, 0.43, 0.38],
    leftFoot: [-0.09, 0.06, 0.43], rightFoot: [0.09, 0.06, 0.43],
  },
  kneeling: {
    head: [0, 1.36, 0], neck: [0, 1.20, 0], shoulder: [0, 1.10, 0], hip: [0, 0.65, 0],
    leftShoulder: [-0.18, 1.10, 0], rightShoulder: [0.18, 1.10, 0],
    leftElbow: [-0.22, 0.82, 0], rightElbow: [0.22, 0.82, 0],
    leftHand: [-0.22, 0.59, 0.04], rightHand: [0.22, 0.59, 0.04],
    leftHip: [-0.09, 0.62, 0], rightHip: [0.09, 0.62, 0],
    leftKnee: [-0.10, 0.12, 0.23], rightKnee: [0.10, 0.43, 0.34],
    leftFoot: [-0.10, 0.07, 0.56], rightFoot: [0.10, 0.07, 0.37],
  },
  lying: {
    head: [-0.72, 0.20, 0], neck: [-0.56, 0.20, 0], shoulder: [-0.45, 0.20, 0], hip: [0.02, 0.20, 0],
    leftShoulder: [-0.42, 0.20, -0.17], rightShoulder: [-0.42, 0.20, 0.17],
    leftElbow: [-0.22, 0.16, -0.29], rightElbow: [-0.22, 0.16, 0.29],
    leftHand: [0.05, 0.15, -0.30], rightHand: [0.05, 0.15, 0.30],
    leftHip: [0.04, 0.20, -0.08], rightHip: [0.04, 0.20, 0.08],
    leftKnee: [0.44, 0.16, -0.09], rightKnee: [0.44, 0.16, 0.09],
    leftFoot: [0.79, 0.11, -0.09], rightFoot: [0.79, 0.11, 0.09],
  },
}

export function getPoseFrame(pose?: PerformerPose): PoseFrame {
  return POSE_FRAMES[pose ?? 'standing'] ?? POSE_FRAMES.standing
}
