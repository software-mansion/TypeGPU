{
  const myFunction = (a: number, b: number) => {
    'use gpu';
    return a + b;
  };
  console.log(myFunction);
}
