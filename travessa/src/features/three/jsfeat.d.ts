// Minimal types for the parts of jsfeat (MIT, CommonJS, no bundled types) the plane tracker uses.
declare module 'jsfeat' {
  interface Matrix {
    cols: number
    rows: number
    // Typed array whose kind depends on the matrix type (u8, i32 or f32).
    data: { [index: number]: number; length: number; set(src: ArrayLike<number>): void; subarray(begin: number, end?: number): ArrayLike<number> }
  }
  interface Pyramid {
    data: Matrix[]
    allocate(width: number, height: number, type: number): void
    build(input: Matrix, skipFirstLevel?: boolean): void
  }
  interface Keypoint {
    x: number
    y: number
    score: number
  }
  interface Point {
    x: number
    y: number
  }
  interface RansacParams {
    size: number
    thresh: number
  }
  interface Kernel {
    run(from: Point[], to: Point[], model: Matrix, count: number): number
  }
  const jsfeat: {
    U8_t: number
    F32_t: number
    C1_t: number
    U8C1_t: number
    COLOR_RGBA2GRAY: number
    matrix_t: new (cols: number, rows: number, type: number) => Matrix
    pyramid_t: new (levels: number) => Pyramid
    keypoint_t: new (x?: number, y?: number, score?: number, level?: number) => Keypoint
    ransac_params_t: new (size: number, thresh: number, eps: number, prob: number) => RansacParams
    motion_model: { homography2d: new () => Kernel }
    motion_estimator: {
      ransac(params: RansacParams, kernel: Kernel, from: Point[], to: Point[], count: number, model: Matrix, mask: Matrix, maxIters?: number): boolean
    }
    imgproc: {
      warp_perspective(src: Matrix, dst: Matrix, transform: Matrix, fill?: number): void
      grayscale(src: Uint8ClampedArray | Uint8Array, w: number, h: number, dst: Matrix, code?: number): void
    }
    fast_corners: {
      set_threshold(threshold: number): number
      detect(src: Matrix, corners: Keypoint[], border?: number): number
    }
    optical_flow_lk: {
      track(
        prevPyr: Pyramid,
        currPyr: Pyramid,
        prevXY: Float32Array,
        currXY: Float32Array,
        count: number,
        winSize: number,
        maxIter?: number,
        status?: Uint8Array,
        eps?: number,
        minEigen?: number,
      ): void
    }
  }
  export default jsfeat
}
