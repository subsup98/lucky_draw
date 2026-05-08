import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, Stack, useRouter } from "expo-router";
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
import { useLogin, useRequestSignupCode, useKakaoLogin } from "../lib/hooks";
import { apiErrorToKo } from "../lib/error-message";

const passwordSchema = z
  .string()
  .min(10, "비밀번호는 10자 이상이어야 합니다")
  .refine((p) => {
    const types = [
      /[A-Za-z]/.test(p),
      /\d/.test(p),
      /[^A-Za-z0-9]/.test(p),
    ].filter(Boolean).length;
    return types >= 2;
  }, "영문/숫자/기호 중 2종 이상을 포함해야 합니다");

const baseSchema = z.object({
  email: z.string().email("이메일 형식이 올바르지 않습니다"),
  password: passwordSchema,
});

const birthdateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식으로 입력해주세요")
  .refine((s) => {
    const d = new Date(s + "T12:00:00Z");
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    let age = now.getUTCFullYear() - d.getUTCFullYear();
    const m = now.getUTCMonth() - d.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
    return age >= 14;
  }, "만 14세 이상만 가입할 수 있습니다");

const signupSchema = baseSchema
  .extend({
    name: z.string().min(1, "이름을 입력하세요"),
    birthdate: birthdateSchema,
    passwordConfirm: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "비밀번호가 일치하지 않습니다",
  });

type FormValues = z.infer<typeof signupSchema>;

export default function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(
      mode === "login" ? baseSchema : signupSchema,
    ) as never,
    defaultValues: {
      email: "",
      password: "",
      name: "",
      birthdate: "",
      passwordConfirm: "",
    },
  });

  const login = useLogin();
  const requestCode = useRequestSignupCode();
  const kakao = useKakaoLogin();
  const busy = login.isPending || requestCode.isPending || kakao.isPending;

  const onKakao = async () => {
    setServerError(null);
    try {
      await kakao.mutateAsync();
      router.replace("/" as never);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "카카오 로그인 실패");
    }
  };

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      if (mode === "signup") {
        // 1단계: 코드 요청 → 2단계 화면으로 이동
        await requestCode.mutateAsync({
          email: values.email,
          password: values.password,
          name: values.name,
          birthdate: values.birthdate,
        });
        router.push({
          pathname: "/verify-signup-code",
          params: { email: values.email },
        } as never);
        return;
      }
      await login.mutateAsync({
        email: values.email,
        password: values.password,
      });
      router.replace("/" as never);
    } catch (e) {
      setServerError(apiErrorToKo(e));
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen
        options={{
          headerShown: true,
          title: mode === "login" ? "로그인" : "회원가입",
          headerBackTitle: "뒤로",
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="flex-1 px-6 pt-6">
          {mode === "login" && (
            <View className="mb-4">
              <Pressable
                onPress={onKakao}
                disabled={busy}
                className="rounded-md py-3 items-center active:opacity-70 disabled:opacity-50"
                style={{ backgroundColor: "#FEE500" }}
              >
                {kakao.isPending ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text className="text-sm font-semibold" style={{ color: "#191919" }}>
                    카카오로 시작하기
                  </Text>
                )}
              </Pressable>
              <View className="flex-row items-center my-4">
                <View className="flex-1 h-px bg-gray-200" />
                <Text className="text-xs text-gray-400 mx-3">또는 이메일로</Text>
                <View className="flex-1 h-px bg-gray-200" />
              </View>
            </View>
          )}

          {mode === "signup" && (
            <>
              <View className="mb-4">
                <Text className="text-sm text-gray-700 mb-1">이름</Text>
                <Controller
                  control={control}
                  name="name"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      autoCapitalize="none"
                      className="border border-gray-300 rounded-md px-3 py-3"
                    />
                  )}
                />
                {errors.name && (
                  <Text className="text-xs text-red-500 mt-1">
                    {errors.name.message}
                  </Text>
                )}
              </View>

              <View className="mb-4">
                <Text className="text-sm text-gray-700 mb-1">
                  생년월일 (YYYY-MM-DD, 만 14세 이상)
                </Text>
                <Controller
                  control={control}
                  name="birthdate"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="2000-01-15"
                      autoCapitalize="none"
                      keyboardType="numbers-and-punctuation"
                      className="border border-gray-300 rounded-md px-3 py-3"
                    />
                  )}
                />
                {errors.birthdate && (
                  <Text className="text-xs text-red-500 mt-1">
                    {errors.birthdate.message}
                  </Text>
                )}
              </View>
            </>
          )}

          <View className="mb-4">
            <Text className="text-sm text-gray-700 mb-1">이메일</Text>
            <Controller
              control={control}
              name="email"
              render={({ field: { value, onChange, onBlur } }) => (
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  className="border border-gray-300 rounded-md px-3 py-3"
                />
              )}
            />
            {errors.email && (
              <Text className="text-xs text-red-500 mt-1">
                {errors.email.message}
              </Text>
            )}
          </View>

          <View className="mb-4">
            <Text className="text-sm text-gray-700 mb-1">
              비밀번호 (10자 이상, 영문/숫자/기호 중 2종 이상)
            </Text>
            <Controller
              control={control}
              name="password"
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
            {errors.password && (
              <Text className="text-xs text-red-500 mt-1">
                {errors.password.message}
              </Text>
            )}
          </View>

          {mode === "signup" && (
            <View className="mb-4">
              <Text className="text-sm text-gray-700 mb-1">비밀번호 확인</Text>
              <Controller
                control={control}
                name="passwordConfirm"
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
              {errors.passwordConfirm && (
                <Text className="text-xs text-red-500 mt-1">
                  {errors.passwordConfirm.message}
                </Text>
              )}
            </View>
          )}

          {serverError && (
            <View className="rounded-md bg-red-50 px-3 py-2 mb-4">
              <Text className="text-sm text-red-600">{serverError}</Text>
            </View>
          )}

          <Pressable
            onPress={handleSubmit(onSubmit)}
            disabled={busy}
            className="bg-black rounded-md py-3 items-center active:opacity-70 disabled:opacity-50"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold">
                {mode === "login" ? "로그인" : "인증 코드 받기"}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              setServerError(null);
              setMode(mode === "login" ? "signup" : "login");
            }}
            className="mt-4 items-center"
          >
            <Text className="text-sm text-gray-600 underline">
              {mode === "login"
                ? "처음이신가요? 회원가입"
                : "이미 계정이 있으신가요? 로그인"}
            </Text>
          </Pressable>

          {mode === "login" && (
            <Link href={"/forgot-password" as never} asChild>
              <Pressable className="mt-3 items-center">
                <Text className="text-sm text-gray-600 underline">
                  비밀번호를 잊으셨나요?
                </Text>
              </Pressable>
            </Link>
          )}

          <Link href={"/privacy" as never} asChild>
            <Pressable className="mt-6 items-center">
              <Text className="text-xs text-gray-500 underline">
                개인정보처리방침
              </Text>
            </Pressable>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
