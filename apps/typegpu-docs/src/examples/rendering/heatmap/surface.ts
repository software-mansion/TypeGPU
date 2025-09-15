class Surface {
  xAxis: number[];
  yAxis: number[];
  numXPoints: number;
  numYPoints: number;

  constructor(xAxis: number[], yAxis: number[]) {
    this.xAxis = xAxis;
    this.yAxis = yAxis;
    this.numXPoints = xAxis.length;
    this.numYPoints = yAxis.length;
  }
}
