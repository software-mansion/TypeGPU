## TODO:
- [X] OK move surface resources to ResourceKeeper
- [X] ! move colorCollback to PlotOptions (cannot do this, plots should be able to have different colors)
- [ ] add offset uniform for planes
- [ ] make default translation and scale changeable (necessary for plots - workaround is change scaler fit result - wrapper)
- [ ] ? optimalize calculations in Grid, Scalers (caching)
- [ ] ?? get rid of base transforms, we can just move camera closer
- [ ] add reset camera button
- [ ] add edges of triangles (vertex pos mod 3 or sth + cross product to check if inside + projection + sdf)
