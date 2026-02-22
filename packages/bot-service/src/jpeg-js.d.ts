declare module 'jpeg-js' {
  interface JPEGData {
    data: Buffer;
    width: number;
    height: number;
  }

  interface EncodeResult {
    data: Buffer;
    width: number;
    height: number;
  }

  function encode(imageData: JPEGData, quality?: number): EncodeResult;

  const jpeg: {
    encode: typeof encode;
  };

  export default jpeg;
}
