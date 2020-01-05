import * as Joi from '@hapi/joi';
import * as bcrypt from 'bcryptjs';
import { InsertResult } from 'typeorm';

import { User, RegisterCode } from '@src/entity';
import { ServiceResult, SessionService, CryptoService } from '@src/services';

interface Schema {
  regCode: string;
  username: string;
  password: string;
}

const schema = Joi.object({
  regCode: Joi.string().required(),
  username: Joi.string().required(),
  password: Joi.string().required(),
});

export default async function (args: object): Promise<ServiceResult> {
  const { value, error } = schema.validate(args);
  if (error) {
    return [400, { msg: error.message }];
  }

  const { regCode: regCodeCipher, username: usernameCipher, password: passwordCipher } = value as Schema;

  const regCode = CryptoService.decrypt(regCodeCipher, CryptoService.privateKey);
  const username = CryptoService.decrypt(usernameCipher, CryptoService.privateKey);
  const password = CryptoService.decrypt(passwordCipher, CryptoService.privateKey);

  const registerCode: RegisterCode | null = await RegisterCode.findOne({
    where: { code: regCode },
    relations: ['user'],
  });

  if (!registerCode) {
    return [400, { msg: '존재하지 않는 회원가입 코드입니다' }];
  }

  if (registerCode.user) {
    return[400, { msg: '이미 사용된 회원가입 코드입니다' }];
  }

  if (await User.findOne({ username })) {
    return [400, { msg: '이미 존재하는 아이디입니다' }];
  }

  const hash: string = await bcrypt.hash(password, 10);
  const result: InsertResult = await User.insert({ username, password: hash });
  const userId: number = result.identifiers[0].id;

  const user: User = await User.findOne(userId);
  await RegisterCode.update(registerCode.id, { user });

  const session = await SessionService.createSession(user);

  return [200, { sessionId: session.id, username: user.username }];
}
