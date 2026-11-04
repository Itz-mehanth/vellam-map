import { ThreeCanvas } from '@remotion/three'
import { useCurrentFrame } from 'remotion'
import * as THREE from 'three'
import { C, EDITORIAL, prog } from '../theme'

/**
 * The idea behind the geometry, in 3D: a wheel of known size stands on the ground, the water rises to the waterline,
 * and the depth is the part of the wheel that is under it. Units: the wheel radius is 1 (about 30 cm).
 */
const Spokes = () => (
  <group>
    {[0, 1, 2, 3, 4].map((i) => (
      <mesh key={i} rotation={[0, 0, (i * Math.PI * 2) / 5]} position={[0, 0, 0.02]}>
        <boxGeometry args={[0.1, 0.62, 0.06]} />
        <meshStandardMaterial color="#b7bdb8" metalness={0.8} roughness={0.35} />
      </mesh>
    ))}
  </group>
)

export const Wheel3D = ({ depthCm, width, height }: { depthCm: number; width: number; height: number }) => {
  const f = useCurrentFrame()
  const unit = 30 // cm per wheel radius, matching the real wheel in the photo
  const rise = prog(f, 20, 70, EDITORIAL)
  const level = -1 + ((depthCm * rise) / unit) // waterline height in scene units
  const swing = Math.sin(f / 80) * 0.3 + 0.3
  const dim = 3.4
  return (
    <ThreeCanvas width={width} height={height} camera={{ position: [1.3, 0.35, 5.6], fov: 30 }} style={{ background: 'transparent' }}>
      <ambientLight intensity={0.85} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} />
      <directionalLight position={[-4, 2, -3]} intensity={0.5} color="#7fd6cc" />
      <group rotation={[0, -0.35 + swing * 0.5, 0]}>
        {/* ground */}
        <gridHelper args={[8, 16, '#2a312d', '#222824']} position={[0, -1, 0]} />
        <mesh position={[0, -1.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[dim * 2.2, dim * 1.6]} />
          <meshStandardMaterial color="#1b211e" />
        </mesh>
        {/* wheel */}
        <group rotation={[0, 0, f * 0.012]}>
          <mesh>
            <torusGeometry args={[0.84, 0.2, 24, 72]} />
            <meshStandardMaterial color="#121513" roughness={0.9} />
          </mesh>
          <mesh>
            <torusGeometry args={[0.64, 0.045, 16, 64]} />
            <meshStandardMaterial color="#c9cfca" metalness={0.9} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <cylinderGeometry args={[0.13, 0.13, 0.12, 24]} />
            <meshStandardMaterial color="#c9cfca" metalness={0.9} roughness={0.3} />
          </mesh>
          <Spokes />
        </group>
        {/* the water: a translucent body up to the waterline, a bright surface and a thin line where it meets the wheel */}
        <mesh position={[0, (-1 + level) / 2, 0]}>
          <boxGeometry args={[dim * 2, Math.max(level + 1, 0.001), 1.6]} />
          <meshPhysicalMaterial color="#168c83" transparent opacity={0.16} roughness={0.15} depthWrite={false} />
        </mesh>
        <mesh position={[0, level, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[dim * 2, 1.6]} />
          <meshBasicMaterial color="#4fc3b8" transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, level, 0.0]}>
          <boxGeometry args={[dim * 2, 0.012, 0.012]} />
          <meshBasicMaterial color="#d99a36" />
        </mesh>
        {/* depth ruler beside the wheel: a tick every 10 cm */}
        <mesh position={[1.75, 0, 0]}>
          <boxGeometry args={[0.02, 2.0, 0.02]} />
          <meshBasicMaterial color={C.paper} />
        </mesh>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[1.75, -1 + (i * 10) / unit, 0]}>
            <boxGeometry args={[i % 3 === 0 ? 0.3 : 0.18, 0.012, 0.012]} />
            <meshBasicMaterial color={C.paper} />
          </mesh>
        ))}
        <mesh position={[1.75, (-1 + level) / 2, 0]}>
          <boxGeometry args={[0.07, Math.max(level + 1, 0.001), 0.07]} />
          <meshBasicMaterial color="#d99a36" />
        </mesh>
      </group>
    </ThreeCanvas>
  )
}
