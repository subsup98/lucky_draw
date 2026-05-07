import { useEffect } from "react";
import { Link, Stack, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMe, useLogout } from "../lib/hooks";
import { useAuthStore } from "../lib/auth-store";

export default function MeScreen() {
  const router = useRouter();
  const authed = useAuthStore((s) => s.authed);
  const hydrated = useAuthStore((s) => s.hydrated);
  const me = useMe();
  const logout = useLogout();

  useEffect(() => {
    if (hydrated && !authed) router.replace("/login" as never);
  }, [hydrated, authed, router]);

  if (!hydrated || me.isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Stack.Screen options={{ headerShown: true, title: "마이", headerBackTitle: "뒤로" }} />
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ headerShown: true, title: "마이" }} />
      <View className="px-6 py-6">
        {me.data ? (
          <View className="mb-6">
            <Text className="text-base">{me.data.name}</Text>
            <Text className="text-sm text-gray-500 mt-1">{me.data.email}</Text>
          </View>
        ) : me.error ? (
          <Text className="text-sm text-red-500 mb-6">
            정보 불러오기 실패
          </Text>
        ) : null}

        <Pressable
          onPress={() => logout.mutate()}
          disabled={logout.isPending}
          className="border border-gray-300 rounded-md py-3 items-center active:opacity-70"
        >
          <Text className="text-sm font-medium">
            {logout.isPending ? "로그아웃 중..." : "로그아웃"}
          </Text>
        </Pressable>

        <Link href={"/privacy" as never} asChild>
          <Pressable className="mt-6 items-center">
            <Text className="text-xs text-gray-500 underline">
              개인정보처리방침
            </Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}
