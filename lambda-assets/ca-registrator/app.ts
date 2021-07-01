import {
  strict as assert,
} from 'assert';
import * as path from 'path';
import {
  IoTClient,
  GetRegistrationCodeCommand,
  RegisterCACertificateCommand,
} from '@aws-sdk/client-iot';
import {
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import {
  Request,
  Response,
} from '@softchef/lambda-events';
import * as Joi from 'joi';
import { CertificateGenerator } from './certificate-generator';
import {
  VerifierError,
  InputError,
  InformationNotFoundError,
} from './errors';

/**
 * event examples
 *
 * event = {}
 *
 * event = {
 *  "csrSubjects": {
 *    "commonName": "", // It would be replaced by the registration code, thus is unnecessary.
 *    "countryName": "TW",
 *    "stateName": "TP",
 *    "localityName": "TW",
 *    "organizationName": "Soft Chef",
 *    "organizationUnitName": "web"
 *  },
 *  "verifierName": "verifier_name",
 *  "templateBody": "{ \"Parameters\" : { \"AWS::IoT::Certificate::Country\" : { \"Type\" : \"String\" }, \"AWS::IoT::Certificate::Id\" : { \"Type\" : \"String\" } }, \"Resources\" : { \"thing\" : { \"Type\" : \"AWS::IoT::Thing\", \"Properties\" : { \"ThingName\" : {\"Ref\" : \"AWS::IoT::Certificate::Id\"}, \"AttributePayload\" : { \"version\" : \"v1\", \"country\" : {\"Ref\" : \"AWS::IoT::Certificate::Country\"}} } }, \"certificate\" : { \"Type\" : \"AWS::IoT::Certificate\", \"Properties\" : { \"CertificateId\": {\"Ref\" : \"AWS::IoT::Certificate::Id\"}, \"Status\" : \"ACTIVE\" } }, \"policy\" : {\"Type\" : \"AWS::IoT::Policy\", \"Properties\" : { \"PolicyDocument\" : \"{\\\"Version\\\": \\\"2012-10-17\\\",\\\"Statement\\\": [{\\\"Effect\\\":\\\"Allow\\\",\\\"Action\\\": [\\\"iot:Connect\\\",\\\"iot:Publish\\\"],\\\"Resource\\\" : [\\\"*\\\"]}]}\" } } } }"
 *  }
 * }
 */

const deafultTemplateBody: string = '{ "Parameters" : { "AWS::IoT::Certificate::Country" : { "Type" : "String" }, "AWS::IoT::Certificate::Id" : { "Type" : "String" } }, "Resources" : { "thing" : { "Type" : "AWS::IoT::Thing", "Properties" : { "ThingName" : {"Ref" : "AWS::IoT::Certificate::Id"}, "AttributePayload" : { "version" : "v1", "country" : {"Ref" : "AWS::IoT::Certificate::Country"}} } }, "certificate" : { "Type" : "AWS::IoT::Certificate", "Properties" : { "CertificateId": {"Ref" : "AWS::IoT::Certificate::Id"}, "Status" : "ACTIVE" } }, "policy" : {"Type" : "AWS::IoT::Policy", "Properties" : { "PolicyDocument" : "{\\"Version\\": \\"2012-10-17\\",\\"Statement\\": [{\\"Effect\\":\\"Allow\\",\\"Action\\": [\\"iot:Connect\\",\\"iot:Publish\\"],\\"Resource\\" : [\\"*\\"]}]}" } } } }';

/**
 * The lambda function handler for register CA.
 * @param event The HTTP request from the API gateway.
 * @returns The HTTP response containing the registration result.
 */
export const handler = async (event: any = {}) : Promise <any> => {
  const request: Request = new Request(event);
  const response: Response = new Response();

  const bucketName: string | undefined = process.env.BUCKET_NAME;
  const bucketPrefix: string = process.env.BUCKET_PREFIX || '';
  const region: string | undefined = process.env.AWS_REGION;
  const jitp: boolean = Joi.attempt(process.env.JITP || false, Joi.boolean());

  const templateBody: string = jitp? request.input('templateBody', deafultTemplateBody) : undefined;
  // can directly set registrationConfig base on the condition of jitp?

  const iotClient: IoTClient = new IoTClient({ region: region });
  const s3Client: S3Client = new S3Client({ region: region });

  const csrSubjectsSchema: Joi.ObjectSchema = Joi.object({
    commonName: Joi.string().allow(''),
    countryName: Joi.string().allow(''),
    stateName: Joi.string().allow(''),
    localityName: Joi.string().allow(''),
    organizationName: Joi.string().allow(''),
    organizationUnitName: Joi.string().allow(''),
  }).unknown(true).allow({}, null);

  try {
    const validated = request.validate(joi => {
      return {
        csrSubjects: csrSubjectsSchema,
        verifierName: joi.string().allow('', null),
      };
    });
    if (validated.error) {
      throw new InputError(JSON.stringify(validated.details));
    }

    let csrSubjects: CertificateGenerator.CsrSubjects = request.input('csrSubjects') || {
      commonName: '',
      countryName: '',
      stateName: '',
      localityName: '',
      organizationName: '',
      organizationUnitName: '',
    };

    let verifierName: string | undefined = '';
    if (request.input('verifierName')) {
      try {
        const verifiers: string[] = JSON.parse(process.env.VERIFIERS!);
        assert(verifierName = verifiers.find((listedName: string) => listedName === request.input('verifierName')));
      } catch (error) {
        throw new VerifierError(error.message);
      }
    }

    const { registrationCode } = await iotClient.send(
      new GetRegistrationCodeCommand({}),
    );
    csrSubjects = Object.assign(csrSubjects, { commonName: registrationCode });

    const certificates: CertificateGenerator.CaRegistrationRequiredCertificates = CertificateGenerator.getCaRegistrationCertificates(csrSubjects);

    const CaRegistration = await iotClient.send(new RegisterCACertificateCommand({
      caCertificate: certificates.ca.certificate,
      verificationCertificate: certificates.verification.certificate,
      allowAutoRegistration: true,
      registrationConfig: jitp? {
        templateBody: templateBody,
        roleArn: process.env.JITP_ROLE_ARN,
      } : {},
      setAsActive: true,
      tags: verifierName? [{ Key: 'verifierName', Value: verifierName }] : [],
      }),
    );

    const { certificateId, certificateArn } = await Joi.object({
      certificateId: Joi.string().required(),
      certificateArn: Joi.string().required(),
    })
      .unknown(true)
      .validateAsync(CaRegistration).catch((error: Error) => {
        throw new InformationNotFoundError(error.message);
      });

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: path.join(bucketPrefix || '', certificateId!, 'ca-certificate.json'),
        Body: Buffer.from(
          JSON.stringify(
            Object.assign(
              {},
              certificates,
              {
                certificateId: certificateId,
                certificateArn: certificateArn,
              },
            ),
          ),
        ),
      }),
    );
    return response.json({ certificateId: certificateId });
  } catch (error) {
    return response.error(error, error.code);
  }
};