import { useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOrder, useCancelOrder } from "../../lib/hooks";
import { ORDER_STATUS_LABEL, formatDate } from "../../lib/labels";
import { apiErrorToKo } from "../../lib/error-message";

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useOrder(id);
  const cancel = useCancelOrder();
  const [serverError, setServerError] = useState<string | null>(null);

  const onCancel = () => {
    if (!id) return;
    Alert.alert(
      "주문 취소",
      "결제 전 주문만 취소할 수 있습니다. 진행할까요?",
      [
        { text: "아니요", style: "cancel" },
        {
          text: "취소하기",
          style: "destructive",
          onPress: async () => {
            setServerError(null);
            try {
              await cancel.mutateAsync(id);
            } catch (e) {
              setServerError(apiErrorToKo(e));
            }
          },
        },
      ],
    );
  };

  if (order.isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Stack.Screen
          options={{ headerShown: true, title: "주문 상세", headerBackTitle: "뒤로" }}
        />
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (order.error || !order.data) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white px-6">
        <Stack.Screen
          options={{ headerShown: true, title: "주문 상세", headerBackTitle: "뒤로" }}
        />
        <Text className="text-sm text-red-500">{apiErrorToKo(order.error)}</Text>
      </SafeAreaView>
    );
  }

  const o = order.data;
  const canCancel = o.status === "PENDING_PAYMENT";

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen
        options={{ headerShown: true, title: "주문 상세", headerBackTitle: "뒤로" }}
      />
      <ScrollView className="flex-1 px-6 py-4">
        <View className="mb-4">
          <Text className="text-xs text-gray-500">주문 상태</Text>
          <Text className="text-lg font-semibold mt-1">
            {ORDER_STATUS_LABEL[o.status] ?? o.status}
          </Text>
        </View>

        <View className="border-y border-gray-100 py-3 mb-4">
          <Row label="티켓 수량" value={`${o.ticketCount}장`} />
          <Row label="단가" value={`${o.unitPrice.toLocaleString()}원`} />
          <Row label="총액" value={`${o.totalAmount.toLocaleString()}원`} bold />
        </View>

        <View className="mb-4">
          <Row label="주문 ID" value={o.id} mono />
          <Row label="주문 일시" value={formatDate(o.createdAt)} />
          {o.paidAt && <Row label="결제 일시" value={formatDate(o.paidAt)} />}
          {o.drawnAt && <Row label="추첨 일시" value={formatDate(o.drawnAt)} />}
          {o.cancelledAt && (
            <Row label="취소 일시" value={formatDate(o.cancelledAt)} />
          )}
        </View>

        {serverError && (
          <View className="rounded-md bg-red-50 px-3 py-2 mb-4">
            <Text className="text-sm text-red-600">{serverError}</Text>
          </View>
        )}

        {canCancel && (
          <Pressable
            onPress={onCancel}
            disabled={cancel.isPending}
            className="border border-red-300 rounded-md py-3 items-center active:opacity-70 disabled:opacity-50"
          >
            <Text className="text-sm font-medium text-red-600">
              {cancel.isPending ? "취소 중..." : "주문 취소"}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  bold,
  mono,
}: {
  label: string;
  value: string;
  bold?: boolean;
  mono?: boolean;
}) {
  return (
    <View className="flex-row justify-between py-1.5">
      <Text className="text-sm text-gray-600">{label}</Text>
      <Text
        className={`text-sm ${bold ? "font-semibold" : ""} ${mono ? "font-mono text-xs" : ""}`}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
