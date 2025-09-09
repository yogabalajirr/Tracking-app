import type { Request } from "express";

export type JwtUser = {
  id: string;
  email: string;
};

export interface AuthedRequest extends Request {
  user?: JwtUser;
}



