import { useState } from "react";
import { Stack, useRouter } from "expo-router";
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
import { useRequestPasswordResetCode } from "../lib/hooks";
import { apiErrorToKo } from "../lib/error-message";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const request = useRequestPasswordResetCode();

  const onSubmit = async () => {
    setServerError(null);
    if (!email.includes("@")) {
      setServerError("이메일 형식이 올바르지 않습니다.");
      return;
    }
    try {
      await request.mutateAsync({ email });
      // 사용자 존재 여부와 무관하게 다음 단계로 — 열거 방지.
      router.push({
        pathname: "/reset-password",
        params: { email },
      } as never);
    } catch (e) {
      setServerError(apiErrorToKo(e));
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen
        options={{
          headerShown: true,
          title: "비밀번호 찾기",
          headerBackTitle: "뒤로",
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="flex-1 px-6 pt-6">
          <Text className="text-sm text-gray-600 mb-6">
            가입하신 이메일을 입력하시면 6자리 인증 코드를 보내드립니다.
          </Text>

          <Text className="text-sm text-gray-700 mb-1">이메일</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            className="border border-gray-300 rounded-md px-3 py-3 mb-4"
          />

          {serverError && (
            <View className="rounded-md bg-red-50 px-3 py-2 mb-4">
              <Text className="text-sm text-red-600">{serverError}</Text>
            </View>
          )}

          <Pressable
            onPress={onSubmit}
            disabled={request.isPending}
            className="bg-black rounded-md py-3 items-center active:opacity-70 disabled:opacity-50"
          >
            {request.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold">코드 받기</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
