import { User } from '../../domain/models/users.model';

export interface CreateUserProperties extends Pick<User, 'name' | 'monthlySavingsAmount'> {
  startingCapital: number;
}
