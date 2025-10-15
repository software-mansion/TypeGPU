Attack plan:
- [X] iterate through all releases
- [ ] find a way to iterate through all the examples without
`exampleRecord` (probably regex for `examples` dir)
  - cannot use dynamic import (loses examples)
  - git clone release
  - run file that measures performance (browser.test) if present
  - read results from json
- [ ] save results
