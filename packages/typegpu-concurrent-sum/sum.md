```
input = 0 1 2 3 4 5 6 7


segmentLength = 8
lid = [0, 1, 2, 3]
shared = 0 1 2 3 4 5 6 7

dLevel=0:
  windowSize = 2
  offset = 1

  0 1 2 3 4 5 6 7
i:_   _   _   _
l:_   _   _   _
r:  _   _   _   _
  0 1 2 5 4 9 6 13

dLevel=1:
  windowSize = 4
  offset = 2
  0 1 2 5 4 9 6 13
i:_       _
l:  _       _
r:      _       _
  0 1 2 6 4 9 6 22
```

```
function recurence(arr){
  if (log2length < workgruppSize * 2){ // jak wystarczajaco mała to process directly
    up pipeline
    down pipeline

    return workArray // to jest ten ostatni, workArray zawiera sumy
  }


  up pipeline
  down pipeline
  arrayOfIncrements = recurrence(sums);
  incrementShader(arrayOfIncrements)

  return workArray
}
```
