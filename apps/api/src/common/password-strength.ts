import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en';
import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

// zxcvbn setup (runs once at module load)
zxcvbnOptions.setOptions({
  translations: zxcvbnEnPackage.translations,
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
  },
});

/**
 * Minimum acceptable zxcvbn score (0 = terrible, 4 = very strong).
 * Score 2 requires a password that takes ~10^4-10^6 attempts to guess online.
 * Blocks: "12345678", "password", "qwerty", most single-word passwords.
 * Accepts: a moderately long passphrase or a short-but-unique combination.
 */
const MIN_SCORE = 2;

export interface PasswordStrengthResult {
  ok: boolean;
  score: number;
  feedback: {
    warning?: string;
    suggestions: string[];
  };
}

export function evaluatePassword(
  password: string,
  userInputs: string[] = [],
): PasswordStrengthResult {
  const result = zxcvbn(password, userInputs);
  return {
    ok: result.score >= MIN_SCORE,
    score: result.score,
    feedback: {
      warning: result.feedback.warning || undefined,
      suggestions: result.feedback.suggestions,
    },
  };
}

/**
 * class-validator decorator. Usage:
 *   @IsStrongPassword()
 *   password!: string;
 *
 * Skips the check if the value is not a string (leave length/presence
 * checks to other decorators like @IsString + @MinLength).
 */
export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'IsStrongPassword',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || value.length === 0) return true;
          return evaluatePassword(value).ok;
        },
        defaultMessage(args: ValidationArguments): string {
          const v = args.value as string;
          if (typeof v !== 'string' || v.length === 0) return '';
          const r = evaluatePassword(v);
          const parts = [
            'La contraseña es demasiado débil.',
            r.feedback.warning,
            ...(r.feedback.suggestions ?? []),
          ].filter(Boolean);
          return parts.join(' ');
        },
      },
    });
  };
}
