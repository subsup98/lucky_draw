import { useState } from "react";
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
import { useVerifySignupCode } from "../lib/hooks";
import { apiErrorToKo } from "../lib/error-message";

export default function VerifySignupCodeScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const verify = useVerifySignupCode();

  const onSubmit = async () => {
    if (code.length !== 6) {
      setServerError("6자리 숫자를 입력해주세요.");
      return;
    }
    setServerError(null);
    try {
      await verify.mutateAsync({ email: email ?? "", code });
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
          title: "이메일 인증",
          headerBackTitle: "뒤로",
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="flex-1 px-6 pt-6">
          <Text className="text-base font-semibold mb-2">
            인증 코드를 입력해주세요
          </Text>
          <Text className="text-sm text-gray-600 mb-6">
            {email} 로 발송된 6자리 코드를 입력하세요. 메일이 안 오면 스팸함도
            확인해주세요.
          </Text>

          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            placeholder="6자리"
            maxLength={6}
            className="border border-gray-300 rounded-md px-3 py-3 text-center text-xl tracking-widest mb-4"
          />

          {serverError && (
            <View className="rounded-md bg-red-50 px-3 py-2 mb-4">
              <Text className="text-sm text-red-600">{serverError}</Text>
            </View>
          )}

          <Pressable
            onPress={onSubmit}
            disabled={verify.isPending}
            className="bg-black rounded-md py-3 items-center active:opacity-70 disabled:opacity-50"
          >
            {verify.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold">확인</Text>
            )}
          </Pressable>

          <Text className="text-xs text-gray-500 mt-4 text-center">
            코드는 5분 후 만료됩니다. 만료되었다면 이전 화면으로 돌아가
            다시 요청해주세요.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
