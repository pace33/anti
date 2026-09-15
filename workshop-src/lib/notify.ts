"use client";
import {toast as manager} from "@/components/ui/toast";
export const toast={success:(title:string)=>manager.add({title,type:"success"}),error:(title:string)=>manager.add({title,type:"error"})};