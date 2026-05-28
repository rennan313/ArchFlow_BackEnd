import { userRepository } from "@/repositories/user.repository"

export const authService = {
  async me(userId: string) {
    const user = await userRepository.findById(userId)
    if (!user) throw new Error("USER_NOT_FOUND")
    return {
      id:        user.id,
      name:      user.name,
      email:     user.email,
      image:     user.image,
      role:      user.role,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }
  },
}
