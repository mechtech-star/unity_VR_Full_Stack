declare module 'three' {
  const THREE: any
  export = THREE
}

declare namespace THREE {
  type AnimationClip = any
}

declare module 'three/examples/jsm/loaders/GLTFLoader' {
  export class GLTFLoader {
    load(url: string, onLoad?: (gltf: any) => void, onProgress?: (event: any) => void, onError?: (error: any) => void): void
  }
}

declare module 'three/examples/jsm/controls/OrbitControls' {
  export class OrbitControls { constructor(...args: any[]); }
}
