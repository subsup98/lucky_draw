import { Stack, Link } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useInquiries } from "../../lib/hooks";
import {
  INQUIRY_CATEGORY_LABEL,
  INQUIRY_STATUS_LABEL,
  formatDate,
} from "../../lib/labels";
import { apiErrorToKo } from "../../lib/error-message";

export default function InquiriesListScreen() {
  const inquiries = useInquiries();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen
        options={{
          headerShown: true,
          title: "내 문의",
          headerBackTitle: "뒤로",
        }}
      />
      <FlatList
        data={inquiries.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: 80 }}
        renderItem={({ item }) => (
          <Link
            href={{ pathname: "/inquiries/[id]", params: { id: item.id } } as never}
            asChild
          >
            <Pressable className="px-4 py-3 border-b border-gray-100 active:bg-gray-50">
              <View className="flex-row justify-between items-center mb-1">
                <Text className="text-sm font-medium" numberOfLines={1}>
                  [{INQUIRY_CATEGORY_LABEL[item.category] ?? item.category}]{" "}
                  {item.subject}
                </Text>
                <Text className="text-xs text-gray-500">
                  {INQUIRY_STATUS_LABEL[item.status] ?? item.status}
                </Text>
              </View>
              <Text className="text-xs text-gray-500">
                {formatDate(item.createdAt)}
              </Text>
            </Pressable>
          </Link>
        )}
        ListEmptyComponent={
          inquiries.isLoading ? (
            <View className="items-center py-10">
              <ActivityIndicator />
            </View>
          ) : inquiries.error ? (
            <Text className="text-center text-sm text-red-500 py-10">
              {apiErrorToKo(inquiries.error)}
            </Text>
          ) : (
            <Text className="text-center text-sm text-gray-500 py-10">
              문의 내역이 없습니다.
            </Text>
          )
        }
      />
      <Link href={"/inquiries/new" as never} asChild>
        <Pressable className="absolute bottom-6 right-6 bg-black rounded-full px-5 py-3 active:opacity-70">
          <Text className="text-white text-sm font-semibold">+ 문의하기</Text>
        </Pressable>
      </Link>
    </SafeAreaView>
  );
}
