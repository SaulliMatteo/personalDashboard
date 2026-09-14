import React from 'react'

import {
  saveLayout,
  loadLayout,
  type LayoutItem,
} from '../../database/layoutRepository';

import type { Dispatch, SetStateAction } from "react";

interface WidgetSettingProps {
  setLayout: Dispatch<SetStateAction<LayoutItem[]>>;
}

const DefaultLayout: LayoutItem[] = [
  { i: "weather", x: 0, y: 0, w: 4, h: 4 },
  { i: "tasks", x: 4, y: 0, w: 4, h: 4 },
  { i: "calendar", x: 4, y: 0, w: 4, h: 2 },
  { i: "notes", x: 0, y: 2, w: 4, h: 4 },
];


const WidgetSetting = ({ setLayout }: WidgetSettingProps) => {

    const resetLayout = async () => {
        setLayout(DefaultLayout);
        await saveLayout(DefaultLayout);
    };
    return (
        <div className='flex flex-col mt-10'>
            <div className='option flex flex-row justify-around'>
                reset posizione widget 
                <button 
                    onClick={resetLayout}
                    className='text-[#131318] bg-white p-1 px-4 rounded-xl '
                > 
                    reset
                </button>
            </div>
        </div>
    )
}

export default WidgetSetting