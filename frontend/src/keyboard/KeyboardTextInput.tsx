import React, { useCallback, useEffect, useState } from "react";
import { TextInput, type NativeSyntheticEvent, type TextInputProps, type TextInputSelectionChangeEventData } from "react-native";
import { type KeyboardMode, useKeyboard } from "@/src/keyboard/KeyboardContext";

type Props = Omit<TextInputProps, "value" | "onChangeText"> & { testID: string; value: string; onChangeText: (value: string) => void; keyboardMode?: KeyboardMode };

export default function KeyboardTextInput({ testID, value, onChangeText, keyboardMode = "text", maxLength, multiline, onSubmitEditing, onFocus, onSelectionChange, ...props }: Props) {
  const { activate: activateKeyboard, sync, detach } = useKeyboard();
  const [selection, setSelection] = useState({ start: value.length, end: value.length });
  const activate = useCallback(() => activateKeyboard({ id: testID, value, onChangeText, selection, setSelection, maxLength, multiline, mode: keyboardMode, onSubmit: onSubmitEditing ? () => onSubmitEditing({} as never) : undefined }), [activateKeyboard, keyboardMode, maxLength, multiline, onChangeText, onSubmitEditing, selection, testID, value]);

  useEffect(() => { sync(testID, { value, onChangeText, selection, setSelection, maxLength, multiline, mode: keyboardMode, onSubmit: onSubmitEditing ? () => onSubmitEditing({} as never) : undefined }); }, [keyboardMode, maxLength, multiline, onChangeText, onSubmitEditing, selection, sync, testID, value]);
  useEffect(() => () => detach(testID), [detach, testID]);
  const selectionChanged = (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => { setSelection(event.nativeEvent.selection); sync(testID, { selection: event.nativeEvent.selection }); onSelectionChange?.(event); };

  return <TextInput {...props} testID={testID} value={value} onChangeText={onChangeText} maxLength={maxLength} multiline={multiline} selection={selection} showSoftInputOnFocus={false} onPressIn={activate} onFocus={(event) => { activate(); onFocus?.(event); }} onSelectionChange={selectionChanged} />;
}