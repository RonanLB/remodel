/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import Code = require('../code');
import Error = require('../error');
import FileWriter = require('../file-writer');
import FunctionUtils = require('../function-utils');
import Maybe = require('../maybe');
import ObjC = require('../objc');
import ObjCImportUtils = require('../objc-import-utils');
import ObjCNullabilityUtils = require('../objc-nullability-utils');
import ObjCTypeUtils = require('../objc-type-utils');
import ObjectGeneration = require('../object-generation');
import StringUtils = require('../string-utils');
import ObjectSpec = require('../object-spec');
import ObjectSpecUtils = require('../object-spec-utils');
import ObjectSpecCodeUtils = require('../object-spec-code-utils');

function nameOfBuilderForValueTypeWithName(valueTypeName: string):string {
  return valueTypeName + 'Builder';
}

function shortNameOfObjectToBuildForValueTypeWithName(valueTypeName: string):string {
  return StringUtils.lowercased(StringUtils.stringRemovingCapitalizedPrefix(valueTypeName));
}

function builderClassMethodForValueType(objectType:ObjectSpec.Type):ObjC.Method {
  return {
    preprocessors:[],
    belongsToProtocol:Maybe.Nothing<string>(),
    code:[
      'return [' + nameOfBuilderForValueTypeWithName(objectType.typeName) + ' new];'
    ],
    comments:[],
    compilerAttributes:[],
    keywords: [
      {
        name: shortNameOfObjectToBuildForValueTypeWithName(objectType.typeName),
        argument:Maybe.Nothing<ObjC.KeywordArgument>()
      }
    ],
    returnType: {
      type: Maybe.Just<ObjC.Type>({
        name: 'instancetype',
        reference: 'instancetype'
      }),
      modifiers: []
    }
  };
}

function keywordArgumentNameForBuilderFromExistingObjectClassMethodForValueType(objectType:ObjectSpec.Type):string {
  return 'existing' + StringUtils.capitalize(shortNameOfObjectToBuildForValueTypeWithName(objectType.typeName));
}

function openingBrace():string {
  return '[';
}

function indentationForItemAtIndexWithOffset(offset:number):(index:number) => string {
  return function(index:number):string {
    const indentation = offset - index;
    return StringUtils.stringContainingSpaces(indentation > 0 ? indentation : 0);
  };
}

function toWithInvocationCallForBuilderFromExistingObjectClassMethodForAttribute(indentationProvider:(index:number) => string, existingObjectName:string, soFar:string[], attribute:ObjectSpec.Attribute, index:number, array:ObjectSpec.Attribute[]):string[] {
  return soFar.concat(indentationProvider(index) + keywordNameForAttribute(attribute) + ':' + existingObjectName + '.' + attribute.name + ']');
}

function stringsWithLastItemContainingStringAtEnd(strings:string[], stringToIncludeAtEndOfLastString:string):string[] {
  const updatedStrings:string[] = strings.concat();
  updatedStrings[updatedStrings.length - 1] = updatedStrings[updatedStrings.length - 1] + stringToIncludeAtEndOfLastString;
  return updatedStrings;
}

function codeForBuilderFromExistingObjectClassMethodForValueType(objectType:ObjectSpec.Type):string[] {
  const returnOpening:string = 'return ';
  const openingBracesForWithMethodInvocations:string[] = objectType.attributes.map(openingBrace);
  const builderCreationCall:string = '[' + nameOfBuilderForValueTypeWithName(objectType.typeName) + ' ' + shortNameOfObjectToBuildForValueTypeWithName(objectType.typeName) + ']';
  const openingLine:string = returnOpening + openingBracesForWithMethodInvocations.join('') + builderCreationCall;

  const indentationProvider:(index:number) => string = indentationForItemAtIndexWithOffset(returnOpening.length + openingBracesForWithMethodInvocations.length);
  const existingObjectName:string = keywordArgumentNameForBuilderFromExistingObjectClassMethodForValueType(objectType);
  const linesForBuildingValuesIntoBuilder:string[] = objectType.attributes.reduce(toWithInvocationCallForBuilderFromExistingObjectClassMethodForAttribute.bind(null, indentationProvider, existingObjectName), []);

  const code:string[] = [openingLine].concat(linesForBuildingValuesIntoBuilder);
  return stringsWithLastItemContainingStringAtEnd(code, ';');
}

function builderFromExistingObjectClassMethodForValueType(objectType:ObjectSpec.Type):ObjC.Method {
  return {
    preprocessors:[],
    belongsToProtocol:Maybe.Nothing<string>(),
    code: codeForBuilderFromExistingObjectClassMethodForValueType(objectType),
    comments:[],
    compilerAttributes:[],
    keywords: [
      {
        name: shortNameOfObjectToBuildForValueTypeWithName(objectType.typeName) + 'FromExisting' + StringUtils.capitalize(shortNameOfObjectToBuildForValueTypeWithName(objectType.typeName)),
        argument:Maybe.Just<ObjC.KeywordArgument>({
          name: keywordArgumentNameForBuilderFromExistingObjectClassMethodForValueType(objectType),
          modifiers: [],
          type: {
            name: objectType.typeName,
            reference: ObjectSpecUtils.typeReferenceForValueTypeWithName(objectType.typeName)
          }
        })
      }
    ],
    returnType: {
      type: Maybe.Just<ObjC.Type>({
        name: 'instancetype',
        reference: 'instancetype'
      }),
      modifiers: []
    }
  };
}

function valueGeneratorForInvokingInitializerWithAttribute(attribute:ObjectSpec.Attribute):string {
  return ObjectSpecCodeUtils.ivarForAttribute(attribute);
}

function buildObjectInstanceMethodForValueType(objectType:ObjectSpec.Type):ObjC.Method {
  return {
    preprocessors:[],
    belongsToProtocol:Maybe.Nothing<string>(),
    code:[
      'return ' + ObjectSpecCodeUtils.methodInvocationForConstructor(objectType, valueGeneratorForInvokingInitializerWithAttribute) + ';'
    ],
    comments:[],
    compilerAttributes:[],
    keywords: [
      {
        name:'build',
        argument:Maybe.Nothing<ObjC.KeywordArgument>()
      }
    ],
    returnType: {
      type: Maybe.Just<ObjC.Type>({
        name: objectType.typeName,
        reference: ObjectSpecUtils.typeReferenceForValueTypeWithName(objectType.typeName)
      }),
      modifiers: []
    }
  };
}

function keywordArgumentNameForAttribute(attribute:ObjectSpec.Attribute):string {
  return attribute.name;
}

function keywordNameForAttribute(attribute:ObjectSpec.Attribute):string {
  return 'with' + StringUtils.capitalize(keywordArgumentNameForAttribute(attribute));
}

function valueToAssignIntoInternalStateForAttribute(supportsValueSemantics:boolean, attribute:ObjectSpec.Attribute):string {
  const keywordArgumentName:string = keywordArgumentNameForAttribute(attribute);
  if (ObjectSpecCodeUtils.shouldCopyIncomingValueForAttribute(supportsValueSemantics, attribute)) {
    return '[' + keywordArgumentName + ' copy]';
  } else {
    return keywordArgumentName;
  }
}

function withInstanceMethodForAttribute(supportsValueSemantics:boolean, attribute:ObjectSpec.Attribute):ObjC.Method {
  return {
    preprocessors:[],
    belongsToProtocol:Maybe.Nothing<string>(),
    code:[
      ObjectSpecCodeUtils.ivarForAttribute(attribute) + ' = ' + valueToAssignIntoInternalStateForAttribute(supportsValueSemantics, attribute) + ';',
      'return self;'
    ],
    comments:[],
    compilerAttributes:[],
    keywords: [
      {
        name: keywordNameForAttribute(attribute),
        argument:Maybe.Just<ObjC.KeywordArgument>({
          name: keywordArgumentNameForAttribute(attribute),
          modifiers: ObjCNullabilityUtils.keywordArgumentModifiersForNullability(attribute.nullability),
          type: {
            name: attribute.type.name,
            reference: attribute.type.reference
          }
        })
      }
    ],
    returnType: {
      type: Maybe.Just<ObjC.Type>({
        name: 'instancetype',
        reference: 'instancetype'
      }),
      modifiers: []
    }
  };
}

function internalPropertyForAttribute(attribute:ObjectSpec.Attribute):ObjC.Property {
  return {
    name: attribute.name,
    comments: [],
    returnType: {
      name: attribute.type.name,
      reference: attribute.type.reference
    },
    modifiers: [],
    access: ObjC.PropertyAccess.Private()
  };
}

function importForAttribute(objectLibrary:Maybe.Maybe<string>, isPublic:boolean, attribute:ObjectSpec.Attribute):ObjC.Import {
  const builtInImportMaybe:Maybe.Maybe<ObjC.Import> = ObjCImportUtils.typeDefinitionImportForKnownSystemType(attribute.type.name);

  return Maybe.match(
    function(builtInImport:ObjC.Import) {
      return builtInImport;
    },
    function() {
      const requiresPublicImport = isPublic || ObjCImportUtils.requiresPublicImportForType(attribute.type.name, ObjectSpecCodeUtils.computeTypeOfAttribute(attribute));
      return {
        library: ObjCImportUtils.libraryForImport(attribute.type.libraryTypeIsDefinedIn, objectLibrary),
        file: ObjCImportUtils.fileForImport(attribute.type.fileTypeIsDefinedIn, attribute.type.name),
        isPublic: requiresPublicImport
      };
    }, builtInImportMaybe);
}

function canUseForwardDeclarationForTypeLookup(typeLookup:ObjectGeneration.TypeLookup):boolean {
  return typeLookup.canForwardDeclare;
}

export function importsForTypeLookupsOfObjectType(objectType:ObjectSpec.Type):ObjC.Import[] {
  const needsImportsForAllTypeLookups = objectType.includes.indexOf('UseForwardDeclarations') !== -1;
  return objectType.typeLookups.map(function(typeLookup:ObjectGeneration.TypeLookup):ObjC.Import {
             if (!typeLookup.canForwardDeclare) {
                 return ObjCImportUtils.importForTypeLookup(objectType.libraryName, true, typeLookup);
             } else if(needsImportsForAllTypeLookups) {
                 return ObjCImportUtils.importForTypeLookup(objectType.libraryName, false, typeLookup);
             } else {
                 return null;
             }
         }).filter(function(maybeImport:ObjC.Import):boolean {
           return (maybeImport != null); 
         });
}

function makePublicImportsForValueType(objectType:ObjectSpec.Type):boolean {
  return objectType.includes.indexOf('UseForwardDeclarations') === -1;
}

function SkipImportsInImplementationForValueType(objectType:ObjectSpec.Type):boolean {
  return objectType.includes.indexOf('SkipImportsInImplementation') !== -1
}

function importsForBuilder(objectType:ObjectSpec.Type):ObjC.Import[] {
  const typeLookupImports:ObjC.Import[] = importsForTypeLookupsOfObjectType(objectType);

  const makePublicImports = makePublicImportsForValueType(objectType);
  const skipAttributeImports = !makePublicImports && SkipImportsInImplementationForValueType(objectType);

  const attributeImports:ObjC.Import[] = (skipAttributeImports 
                                          ? [] 
                                          : objectType.attributes.filter(FunctionUtils.pApplyf2(objectType.typeLookups, mustDeclareImportForAttribute))
                                                                                                   .map(function(attribute:ObjectSpec.Attribute):ObjC.Import {
                                                                                                     return importForAttribute(objectType.libraryName, false, attribute);
                                                                                                   }));

  return [
    {file:'Foundation.h', isPublic:true, library:Maybe.Just('Foundation')},
    {file:objectType.typeName + '.h', isPublic:false, library:objectType.libraryName},
    {file:nameOfBuilderForValueTypeWithName(objectType.typeName) + '.h', isPublic:false, library:Maybe.Nothing<string>()}
  ].concat(typeLookupImports).concat(attributeImports);
}

function mustDeclareImportForAttribute(typeLookups:ObjectGeneration.TypeLookup[], attribute:ObjectSpec.Attribute):boolean {
  return ObjCImportUtils.shouldIncludeImportForType(typeLookups, attribute.type.name);
}

function forwardDeclarationsForBuilder(objectType:ObjectSpec.Type):ObjC.ForwardDeclaration[] {
  const typeLookupForwardDeclarations:ObjC.ForwardDeclaration[] = objectType.typeLookups.filter(canUseForwardDeclarationForTypeLookup)
                                                                                     .map(function (typeLookup:ObjectGeneration.TypeLookup):ObjC.ForwardDeclaration {
                                                                                       return ObjC.ForwardDeclaration.ForwardClassDeclaration(typeLookup.name);
                                                                                     });

  const attributeForwardClassDeclarations:ObjC.ForwardDeclaration[] = objectType.attributes.filter(ObjCImportUtils.canForwardDeclareTypeForAttribute).map(function(attribute:ObjectSpec.Attribute):ObjC.ForwardDeclaration {
    return ObjC.ForwardDeclaration.ForwardClassDeclaration(attribute.type.name);
  });

  const attributeForwardProtocolDeclarations:ObjC.ForwardDeclaration[] =  objectType.attributes.filter(ObjCImportUtils.shouldForwardProtocolDeclareAttribute)
                                                                                               .map(ObjCImportUtils.forwardProtocolDeclarationForAttribute);

  return [
    ObjC.ForwardDeclaration.ForwardClassDeclaration(objectType.typeName)
  ].concat(typeLookupForwardDeclarations).concat(attributeForwardClassDeclarations).concat(attributeForwardProtocolDeclarations);
}

function builderFileForValueType(objectType:ObjectSpec.Type):Code.File {
  return {
    name: nameOfBuilderForValueTypeWithName(objectType.typeName),
    type: Code.FileType.ObjectiveC(),
    imports:importsForBuilder(objectType),
    forwardDeclarations:forwardDeclarationsForBuilder(objectType),
    comments:[],
    enumerations: [],
    blockTypes:[],
    staticConstants: [],
    functions:[],
    classes: [
      {
        baseClassName:'NSObject',
        covariantTypes:[],
        classMethods: [
          builderClassMethodForValueType(objectType),
          builderFromExistingObjectClassMethodForValueType(objectType)
        ],
        comments: [ ],
        instanceMethods: [buildObjectInstanceMethodForValueType(objectType)].concat(objectType.attributes.map(FunctionUtils.pApplyf2(ObjectSpecUtils.typeSupportsValueObjectSemantics(objectType), withInstanceMethodForAttribute))),
        name: nameOfBuilderForValueTypeWithName(objectType.typeName),
        properties: [],
        internalProperties:objectType.attributes.map(internalPropertyForAttribute),
        implementedProtocols: [],
        nullability:ObjC.ClassNullability.default,
        subclassingRestricted: false,
      }
    ],
    diagnosticIgnores:[],
    structs: [],
    namespaces: [],
    macros: [],
  };
}

export function createPlugin():ObjectSpec.Plugin {
  return {
    additionalFiles: function(objectType:ObjectSpec.Type):Code.File[] {
      return [
        builderFileForValueType(objectType)
      ];
    },
    additionalTypes: function(objectType:ObjectSpec.Type):ObjectSpec.Type[] {
      return [];
    },
    attributes: function(objectType:ObjectSpec.Type):ObjectSpec.Attribute[] {
      return [];
    },
    classMethods: function(objectType:ObjectSpec.Type):ObjC.Method[] {
      return [];
    },
    fileTransformation: function(request:FileWriter.Request):FileWriter.Request {
      return request;
    },
    fileType: function(objectType:ObjectSpec.Type):Maybe.Maybe<Code.FileType> {
      return Maybe.Nothing<Code.FileType>();
    },
    forwardDeclarations: function(objectType:ObjectSpec.Type):ObjC.ForwardDeclaration[] {
      return [];
    },
    functions: function(objectType:ObjectSpec.Type):ObjC.Function[] {
      return [];
    },
    headerComments: function(objectType:ObjectSpec.Type):ObjC.Comment[] {
      return [];
    },
    implementedProtocols: function(objectType:ObjectSpec.Type):ObjC.Protocol[] {
      return [];
    },
    imports: function(objectType:ObjectSpec.Type):ObjC.Import[] {
      return [];
    },
    instanceMethods: function(objectType:ObjectSpec.Type):ObjC.Method[] {
      return [];
    },
    macros: function(valueType:ObjectSpec.Type):ObjC.Macro[] {
      return [];
    },
    properties: function(objectType:ObjectSpec.Type):ObjC.Property[] {
      return [];
    },
    requiredIncludesToRun:['RMBuilder'],
    staticConstants: function(objectType:ObjectSpec.Type):ObjC.Constant[] {
      return [];
    },
    validationErrors: function(objectType:ObjectSpec.Type):Error.Error[] {
      return [];
    },
    nullability: function(objectType:ObjectSpec.Type):Maybe.Maybe<ObjC.ClassNullability> {
      return Maybe.Nothing<ObjC.ClassNullability>();
    },
    subclassingRestricted: function(objectType:ObjectSpec.Type):boolean {
      return false;
    },
  };
}
