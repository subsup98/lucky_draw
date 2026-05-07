import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useResetPassword } from "../lib/hooks";
import { apiErrorToKo } from "../lib/error-message";

const schema = z
  .object({
    code: z.string().regex(/^\d{6}$/, "6자리 숫자를 입력해주세요"),
    newPassword: z
      .string()
      .min(10, "비밀번호는 10자 이상이어야 합니다")
      .refine((p) => {
        const types = [
          /[A-Za-z]/.test(p),
          /\d/.test(p),
          /[^A-Za-z0-9]/.test(p),
        ].filter(Boolean).length;
        return types >= 2;
      }, "영문/숫자/기호 중 2종 이상을 포함해야 합니다"),
    newPasswordConfirm: z.string(),
  })
  .refine((d) => d.newPassword === d.newPasswordConfirm, {
    path: ["newPasswordConfirm"],
    message: "비밀번호가 일치하지 않습니다",
  });

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [serverError, setServerError] = useState<string | null>(null);
  const reset = useResetPassword();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: "", newPassword: "", newPasswordConfirm: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await reset.mutateAsync({
        email: email ?? "",
        code: values.code,
        newPassword: values.newPassword,
      });
      router.replace("/login" as never);
    } catch (e) {
      setServerError(apiErrorToKo(e));
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen
        options={{
          headerShown: true,
          title: "비밀번호 재설정",
          headerBackTitle: "뒤로",
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="flex-1 px-6 pt-6">
          <Text className="text-sm text-gray-600 mb-6">
            {email} 로 발송된 6자리 코드와 새 비밀번호를 입력해주세요.
          </Text>

          <View className="mb-4">
            <Text className="text-sm text-gray-700 mb-1">인증 코드</Text>
            <Controller
              control={control}
              name="code"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  value={value}
                  onChangeText={(v) =>
                    onChange(v.replace(/\D/g, "").slice(0, 6))
                  }
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="6자리"
                  className="border border-gray-300 rounded-md px-3 py-3 text-center text-xl tracking-widest"
                />
              )}
            />
            {errors.code && (
              <Text className="text-xs text-red-500 mt-1">
                {errors.code.message}
              </Text>
            )}
          </View>

          <View className="mb-4">
            <Text className="text-sm text-gray-700 mb-1">
              새 비밀번호 (10자 이상, 영문/숫자/기호 중 2종 이상)
            </Text>
            <Controller
              control={control}
              name="newPassword"
              render={({ field: { value, onChange, onBlur } }) => (
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  secureTextEntry
                  autoCapitalize="none"
                  className="border border-gray-300 rounded-md px-3 py-3"
                />
              )}
            />
            {errors.newPassword && (
              <Text className="text-xs text-red-500 mt-1">
                {errors.newPassword.message}
              </Text>
            )}
          </View>

          <View className="mb-4">
            <Text className="text-sm text-gray-700 mb-1">새 비밀번호 확인</Text>
            <Controller
              control={control}
              name="newPasswordConfirm"
              render={({ field: { value, onChange, onBlur } }) => (
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  secureTextEntry
                  autoCapitalize="none"
                  className="border border-gray-300 rounded-md px-3 py-3"
                />
              )}
            />
            {errors.newPasswordConfirm && (
              <Text className="text-xs text-red-500 mt-1">
                {errors.newPasswordConfirm.message}
              </Text>
            )}
          </View>

          {serverError && (
            <View className="rounded-md bg-red-50 px-3 py-2 mb-4">
              <Text className="text-sm text-red-600">{serverError}</Text>
            </View>
          )}

          <Pressable
            onPress={handleSubmit(onSubmit)}
            disabled={reset.isPending}
            className="bg-black rounded-md py-3 items-center active:opacity-70 disabled:opacity-50"
          >
            {reset.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold">변경하기</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
