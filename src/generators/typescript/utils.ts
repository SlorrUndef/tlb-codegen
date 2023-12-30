import { TLBBinaryOp, TLBCode, TLBConstructor, TLBMathExpr, TLBNumberExpr, TLBNumberType, TLBParameter, TLBType, TLBUnaryOp, TLBVarExpr } from '../../ast'
import { getCurrentSlice, getSubStructName } from '../../utils'
import { BinaryExpression, Expression, Identifier, ObjectProperty, Statement, TypeExpression, tBinaryExpression, tDeclareVariable, tExpressionStatement, tForCycle, tFunctionCall, tIdentifier, tIfStatement, tMemberExpression, tNumericLiteral, tObjectProperty, tReturnStatement, tStringLiteral, tTypeParametersExpression, tUnaryOpExpression } from './tsgen'

export type FieldInfoType = {
  typeParamExpr: TypeExpression | undefined
  loadExpr: Expression | undefined
  loadFunctionExpr: Expression | undefined
  storeExpr: Statement | undefined
  storeExpr2: Statement | undefined
  storeFunctionExpr: Expression | undefined
  negatedVariablesLoads: Array<{ name: string; expression: Expression }>
}
export type ExprForParam = {
  argLoadExpr: Expression | undefined
  argStoreExpr: Expression | undefined
  paramType: string
  fieldLoadSuffix: string
  fieldStoreSuffix: string
}

export function sliceLoad(slicePrefix: number[], currentSlice: string) {
  return tExpressionStatement(tDeclareVariable(tIdentifier(getCurrentSlice(slicePrefix, 'slice')),
    tFunctionCall(tMemberExpression(
      tFunctionCall(tMemberExpression(
        tIdentifier(currentSlice), tIdentifier('loadRef')
      ), []),
      tIdentifier('beginParse')
    ), []),))
}

export function simpleCycle(varName: string, finish: Expression): Statement {
  return tForCycle(tDeclareVariable(tIdentifier(varName), tNumericLiteral(0)), tBinaryExpression(tIdentifier(varName), '<', finish), tNumericLiteral(5), [])
}

export function getParamVarExpr(param: TLBParameter, constructor: TLBConstructor): Expression {
  if (param.variable.deriveExpr) {
    return convertToAST(param.variable.deriveExpr, constructor);
  } else {
    throw new Error(`Could not get expression for param ${param.variable.name} for constructor ${constructor.name} of type ${constructor.tlbType}`)
  }
}

export function getVarExprByName(name: string, constructor: TLBConstructor): Expression {
  let variable = constructor.variablesMap.get(name)
  if (variable?.deriveExpr) {
    return convertToAST(variable.deriveExpr, constructor);
  }
  return tIdentifier(name)
}

export function getNegationDerivationFunctionBody(tlbCode: TLBCode, typeName: string, parameterIndex: number, parameterName: string): Statement[] {
  let result: Statement[] = [];
  let tlbType: TLBType | undefined = tlbCode.types.get(typeName);
  if (!tlbType) {
    throw new Error(`Can not find type ${typeName}`)
  }
  tlbType.constructors.forEach(constructor => {
    let parameter = constructor.parameters[parameterIndex];
    if (parameter) {
      let getExpression: Expression;
      getExpression = convertToAST(parameter.paramExpr, constructor);
      let statements = [];
      if (!parameter.variable.isConst) {
        statements.push(tExpressionStatement(tDeclareVariable(tIdentifier(parameter.variable.name), tMemberExpression(tIdentifier(parameterName), tIdentifier(parameter.variable.name)))));
      }
      statements.push(tReturnStatement(getExpression));
      if (tlbType) {
        result.push(tIfStatement(tBinaryExpression(tMemberExpression(tIdentifier(parameterName), tIdentifier('kind')), '==', tStringLiteral(getSubStructName(tlbType, constructor))), statements))
      }
    }
  });

  let exceptionTypesComment = tlbType.constructors.map(constructor => { return `"${tlbType ? getSubStructName(tlbType, constructor) : ''}"` }).join(', ')
  let exceptionComment = tExpressionStatement(tIdentifier("throw new Error('" + `Expected one of ${exceptionTypesComment} for type "${tlbType.name}" while getting "${parameterName}", but data does not satisfy any constructor` + "')"))
  result.push(exceptionComment)

  return result;
}

export function addLoadProperty(name: string, loadExpr: Expression, typeExpr: TypeExpression | undefined, constructorLoadStatements: Statement[], subStructLoadProperties: ObjectProperty[]) {
  let nameId = tIdentifier(name);
  constructorLoadStatements.push(tExpressionStatement(tDeclareVariable(nameId, loadExpr, typeExpr)))
  subStructLoadProperties.push(tObjectProperty(nameId, nameId))
}

export function convertToAST(mathExpr: TLBMathExpr, constructor: TLBConstructor, objectId?: Identifier): Expression {
  if (mathExpr instanceof TLBVarExpr) {
    let varName = mathExpr.x;
    if (objectId != undefined) {
      return tMemberExpression(objectId, tIdentifier(varName));
    }
    return tIdentifier(varName);
  }
  if (mathExpr instanceof TLBNumberExpr) {
    return tNumericLiteral(mathExpr.n);
  }
  if (mathExpr instanceof TLBBinaryOp) {
    let operation: string = mathExpr.operation;
    if (operation == '=') {
      operation = '==';
    }
    return tBinaryExpression(convertToAST(mathExpr.left, constructor, objectId), operation, convertToAST(mathExpr.right, constructor, objectId));
  }
  if (mathExpr instanceof TLBUnaryOp) {
    if (mathExpr.operation == '.') {
      return tFunctionCall(tIdentifier('bitLen'), [convertToAST(mathExpr.value, constructor, objectId)])
    }
    return tUnaryOpExpression(mathExpr.operation, convertToAST(mathExpr.value, constructor, objectId))
  }
  throw new Error(`Type ${constructor.tlbType}, constructor ${constructor.name}: couldn't convert to math expression: ${mathExpr}`)
}

export function getTypeParametersExpression(parameters: Array<TLBParameter>) {
  let structTypeParameters: Array<Identifier> = [];
  parameters.forEach(element => {
    if (element.variable.type == 'Type') {
      structTypeParameters.push(tIdentifier(element.variable.name));
    }
  });
  let structTypeParametersExpr = tTypeParametersExpression(structTypeParameters);
  return structTypeParametersExpr;
}

export function getCondition(conditions: Array<BinaryExpression>): Expression {
  let cnd = conditions[0];
  if (cnd) {
    if (conditions.length > 1) {
      return tBinaryExpression(cnd, '&&', getCondition(conditions.slice(1)));
    } else {
      return cnd;
    }
  } else {
    return tIdentifier('true');
  }
}

export function isBigInt(fieldType: TLBNumberType) {
  if (fieldType.bits instanceof TLBNumberExpr) {
    if (fieldType.bits.n <= 64) {
      return false
    }
  }
  if (fieldType.maxBits && fieldType.maxBits <= 64) {
    return false
  }
  return true
}

