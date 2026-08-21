import { Operator } from 'tsover-runtime';
import { MatBase } from './matrix.ts';
import { VecBase } from './vectorImpl.ts';
import { assignInfixOperator } from '../tgsl/infixDispatch.ts';

assignInfixOperator(VecBase, 'add', Operator.plus);
assignInfixOperator(MatBase, 'add', Operator.plus);
assignInfixOperator(VecBase, 'sub', Operator.minus);
assignInfixOperator(MatBase, 'sub', Operator.minus);
assignInfixOperator(VecBase, 'mul', Operator.star);
assignInfixOperator(MatBase, 'mul', Operator.star);
assignInfixOperator(VecBase, 'div', Operator.slash);
assignInfixOperator(VecBase, 'mod', Operator.percent);
assignInfixOperator(VecBase, 'bitShiftLeft', Symbol()); // bitShift does not yet have tsover operator symbol
assignInfixOperator(VecBase, 'bitShiftRight', Symbol()); // bitShift does not yet have tsover operator symbol
