This is a plan for a future article.

## Sources

- https://mattdesl.svbtle.com/drawing-lines-is-hard
- https://blog.mapbox.com/drawing-antialiased-lines-with-opengl-8766f34192dc
- https://wwwtyro.net/2019/11/18/instanced-lines.html
- https://wwwtyro.net/2021/10/01/instanced-lines-part-2.html

## TODO

- joining segments
- triangulation

## Basic example

- show how to implement a simple render command which renders a line of segments
  which change width based on where the mouse cursor is, with a nice shading

## Overlaps

- explain the problem
- reverse miter solution
- intersecting reverse miters

## Edge cases

- enumerate situations a join can be in
- detecting whether to join or reverse miter
- collapsing joins into miters
- hairpin detection and what is done in this case
- degenerate lines (start point "inside" end point)

## Example showing off reverse miter

- tbd

## Shading

- naive approach and the shortcomings
- homogeneous coordinates and "perspective" correction
- contour level sets
- constant width outline
- dashes

## Single-sided expansion

- thick outline / box shadow example

## Miter join math

## Arrow cap math
