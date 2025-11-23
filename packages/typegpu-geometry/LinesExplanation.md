This is a plan for a future article.

## Sources

- https://mattdesl.svbtle.com/drawing-lines-is-hard
- https://blog.mapbox.com/drawing-antialiased-lines-with-opengl-8766f34192dc
- https://wwwtyro.net/2019/11/18/instanced-lines.html
- https://wwwtyro.net/2021/10/01/instanced-lines-part-2.html

## Goals

- variable width line
- choice of start / end caps, joins
- minimal overlaps
- visually acceptable behavior in extreme cases
- single draw call (easy to use)
- easily colored based on contour level sets
- easily colored based on distance along line (dashes)
- minimize complexity
- single-sided expansion for non-overlapping outlines

## Non-goals

- maximum performance
- triangle counts
- overdraw (having max-area triangles)

## Basics

- start with variable width line segment computations
- caps
- joining segments
- triangulation

## Basic example

- implement a simple render command which renders a line of segments which
  change width based on where the mouse cursor is, with a nice shading

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
