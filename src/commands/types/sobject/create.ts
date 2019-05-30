import { core, flags, SfdxCommand } from '@salesforce/command';
import { some } from 'lodash';
import { join } from 'path';

// Convert fs.readFile into Promise version of same    

// Initialize Messages with the current plugin directory
core.Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = core.Messages.loadMessages('salesforce-to-types', 'sobject');

const header = `
/**
 * DO NOT MODIFY THIS FILE!
 *
 * This file is generated by the salesforce-to-types plugin and
 * may be regenerated in the future. It is recommended to make
 * changes to that plugin then regenerate these files.
 *
 */
`;

const sobject = `${header}\nimport { ID } from \'./sobjectTypes\';

export interface SObject {
  Id?: ID;
}
`;


const sobjectTypes = `${header}
export type ID = String;
export type DateString = String;
export type PhoneString = String;
`;

export default class Org extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
    '$ sfdx types:sobject:create --sobject Account',
    '$ sfdx types:sobject:create --sobject MyCustomObject__c --directory types/ --targetusername myOrg@example.com'
  ];

  protected static flagsConfig = {
    // flag with a value (-n, --name=VALUE)
    outputdir: {
      type: 'directory',
      char: 'o',
      description: messages.getMessage('directoryFlagDescription'),
      default: './src/types'
    },
    sobject: flags.string({
      char: 's',
      description: messages.getMessage('sobjectFlagDescription'),
      required: false
    }),
    config: flags.string({
      char: 'c',
      description: 'config file',
      required: false
    })

  };

  // Comment this out if your command does not require an org username
  protected static requiresUsername = true;

  private createdFiles = [];
  private unmappedChildRelationships = new Set<String>();

  public async run(): Promise<core.AnyJson> {
    await 
    await this.createBaseSObjectType();
    await this.createSalesforceFieldTypes();
    await this.generateSObjectType();

    if (this.createdFiles.length > 0) {
      this.ux.styledHeader('Create types');
      this.ux.table(this.createdFiles.map(filePath => ({ file: filePath })), {
        columns: [{key: 'file', label: 'Output file path'}]
      });
    } else {
      this.ux.log('No types created.');
    }

    // Return an object to be displayed with --json
    return { files: this.createdFiles };
  }

  private async createBaseSObjectType() {
    const dir = await core.fs.readdir(this.flags.outputdir);
    const filePath = join(this.flags.outputdir, 'sobject.ts');
    await core.fs.writeFile(filePath, sobject);
    this.createdFiles.push(filePath);
  }

  private async createSalesforceFieldTypes() {
    const dir = await core.fs.readdir(this.flags.outputdir);
    const filePath = join(this.flags.outputdir, 'sobjectTypes.ts');
    await core.fs.writeFile(filePath, sobjectTypes);
    this.createdFiles.push(filePath);
    return 
  }



  private async generateSObjectTypeContents(objectName: string, sObjects?: Array<String>) {
    const conn = this.org.getConnection();
    const describe = await conn.describe(objectName);
    let typeContents = '';

    typeContents += `\n\nexport interface ${objectName} extends SObject {`;

    describe.fields.forEach(field => {
      if(field['name'] == 'Id') {
        return;
      }
      let typeName: string;
      switch (field['type']) {
        case 'boolean':
          typeName = 'Boolean';
          break;
        case 'int':
        case 'double':
          typeName = 'Number';
          break;
        case 'date':
        case 'datetime':
          typeName = 'DateString';
          break;
        case 'phone':
          typeName = 'PhoneString';
          break;
        case 'string':
        case 'textarea':
          typeName = 'String';
          break;
        case 'reference':
          typeName = 'ID';
          break;
        default:
          typeName = `String //${field['type']}`;
      }
      typeContents += `\n  ${field['name']}?: ${typeName};`;
      if (field['type'] == 'reference') {
          let refTypeName;
          field.referenceTo.forEach(r => {
            if(sObjects && sObjects.find(f=> f === r)){
              //add it if its in our list
              refTypeName = refTypeName ? `${refTypeName} | ${r}` : r
            }
          });
          if(refTypeName){
            typeContents += `\n  ${field['relationshipName']}?: ${refTypeName};`;
          }
      }
    });
    describe.childRelationships.forEach(child => {
      const childSObject = child['childSObject'];
      const childRelationshipName = child['relationshipName'];
      if(sObjects && sObjects.find(f=> f === childSObject)){
        if(childRelationshipName){
          typeContents += `\n  ${childRelationshipName}?: Array<${childSObject}>;`;
        } else{
          child['junctionReferenceTo'].forEach(j => {
            typeContents += `\n  ${j}?: Array<${childSObject}>;`;
          });
        }
      } else if(childRelationshipName){
        this.unmappedChildRelationships.add(childSObject);
        typeContents += `\n  ${childRelationshipName}?: Array<${childSObject}>;`;
      } else if(!childRelationshipName){
        //typeContents += `\n  ${childSObject}?: ${childSObject};`;
        // child['junctionReferenceTo'].forEach(j => {
        //   typeContents += `\n  ${j}?: Array<any>;`;
        // });
    }

    });
    typeContents += '\n}\n';
    
    return typeContents
  }

  private async generateSObjectType() {
    const objectName: string = this.flags.sobject;
    let filePath = '';
    let typeContents = `${header}\nimport { SObject } from \'./sobject\';`;
    typeContents += `\nimport { ID, DateString, PhoneString } from \'./sobjectTypes\';`;
    if(objectName){
      const pascalObjectName = objectName.replace('__c', '').replace('_', '');
      typeContents = await this.generateSObjectTypeContents(objectName)
      filePath = join(this.flags.outputdir, `${pascalObjectName.toLowerCase()}.ts`);
    } else if(this.flags.config) {
      const buffer = await core.fs.readFile(this.flags.config);
      let json = buffer.toString('utf8');
      const {sobjects} = JSON.parse(json);
      const promises: Array<Promise<string | void>> = [];
      for (const s of sobjects) {
        process.stdout.write(`Processing... ${s}`);
        process.stdout.write("\n"); 
        promises.push(this.generateSObjectTypeContents(s, sobjects));
      }
      process.stdout.write(`Writing to file...`);
      await Promise.all(promises);
      promises.forEach(p => {
        p.then(result => {
          typeContents += result;
        });
      })
      await Promise.all(promises);
      typeContents += `\n// unmapped types:`;
      Array.from(this.unmappedChildRelationships).sort().forEach(unmappedType => {
        typeContents += `\ntype ${unmappedType} = any; `;
      });
      filePath = join(this.flags.outputdir, `sobjects.ts`);
    } else {
      process.stderr.write(`Please provide a -s or -c`);
    }

    await core.fs.writeFile(filePath, typeContents);
    this.createdFiles.push(filePath);
  }
}
